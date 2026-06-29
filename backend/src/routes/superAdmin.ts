import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import * as store from '../db/store';
import { authenticate, superAdminOnly, createSession, AuthRequest } from '../middleware/auth';
import { verifyMasterPassword } from '../utils/masterPassword';
import {
  emptyEvacFileFields,
  evacPlanPayload,
  evacuationUpload,
  deleteCompanyEvacFile,
  hasEvacuationPlan,
  readTextPlanIfApplicable,
  ensureUploadDirs,
} from '../utils/evacuationFiles';

const router = Router();

ensureUploadDirs();

const generateCompanyCode = (companyName: string): string => {
  const base = companyName
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 8);
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 900 + 100);
  return `${base}${year}${random}`;
};

router.post('/login', (req: Request, res: Response) => {
  const { password } = req.body;
  if (!verifyMasterPassword(password)) {
    return res.status(401).json({ error: 'Invalid master password' });
  }
  const token = createSession({ role: 'super_admin' }, '24h');
  return res.json({ token, message: 'Super admin logged in' });
});

router.post('/companies', authenticate, superAdminOnly, async (req: AuthRequest, res: Response) => {
  const {
    name,
    admin_password,
    building_name,
    address,
    total_floors,
    evacuation_plan,
    assembly_point,
  } = req.body;

  if (!name || !admin_password) {
    return res.status(400).json({ error: 'Company name and admin password are required' });
  }

  const existing = await store.findCompanyByName(name);
  if (existing) {
    return res.status(409).json({ error: 'Company with this name already exists' });
  }

  const hashedPassword = await bcrypt.hash(admin_password, 10);
  let company_code = generateCompanyCode(name);

  while (await store.companyCodeExists(company_code)) {
    company_code = generateCompanyCode(name);
  }

  await store.createCompany({
    id: uuidv4(),
    name,
    company_code,
    admin_password: hashedPassword,
    building_name: building_name || '',
    address: address || '',
    total_floors: total_floors || 1,
    evacuation_plan: evacuation_plan || '',
    assembly_point: assembly_point || '',
    ...emptyEvacFileFields(),
    is_active: true,
  });

  return res.status(201).json({
    message: 'Company created successfully',
    company_code,
    company_name: name,
    note: 'Give this company_code to the company admin along with the admin_password you set',
  });
});

router.get('/companies', authenticate, superAdminOnly, async (_req: AuthRequest, res: Response) => {
  const companies = await store.listCompaniesSummary();
  return res.json({ companies, total: companies.length });
});

router.get('/companies/:company_code', authenticate, superAdminOnly, async (req: AuthRequest, res: Response) => {
  const company_code = String(req.params.company_code);
  const company = await store.findCompanyByCode(company_code);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  const zones = await store.listZonesByCompany(company_code);
  const workers = await store.listWorkersByCompany(company_code, true);

  return res.json({
    company: {
      id: company.id,
      name: company.name,
      company_code: company.company_code,
      building_name: company.building_name,
      address: company.address,
      total_floors: company.total_floors,
      ...evacPlanPayload(company),
      is_active: company.is_active,
      created_at: company.created_at,
    },
    stats: {
      total_zones: zones.length,
      worker_count: workers.length,
    },
    zones,
  });
});

router.patch('/companies/:company_code', authenticate, superAdminOnly, async (req: AuthRequest, res: Response) => {
  const company_code = String(req.params.company_code);
  const { building_name, address, total_floors, evacuation_plan, assembly_point } = req.body;

  const company = await store.updateCompany(company_code, {
    ...(building_name !== undefined && { building_name }),
    ...(address !== undefined && { address }),
    ...(total_floors !== undefined && { total_floors }),
    ...(evacuation_plan !== undefined && { evacuation_plan }),
    ...(assembly_point !== undefined && { assembly_point }),
  });

  if (!company) return res.status(404).json({ error: 'Company not found' });

  return res.json({
    message: 'Company updated',
    company: {
      company_code: company.company_code,
      name: company.name,
      building_name: company.building_name,
      address: company.address,
      total_floors: company.total_floors,
      ...evacPlanPayload(company),
    },
  });
});

router.put('/companies/:company_code/evacuation-plan', authenticate, superAdminOnly, async (req: AuthRequest, res: Response) => {
  const company_code = String(req.params.company_code);
  const { evacuation_plan, assembly_point } = req.body;
  if (evacuation_plan === undefined && assembly_point === undefined) {
    return res.status(400).json({ error: 'evacuation_plan or assembly_point is required' });
  }

  const company = await store.updateCompany(company_code, {
    ...(evacuation_plan !== undefined && { evacuation_plan }),
    ...(assembly_point !== undefined && { assembly_point }),
  });
  if (!company) return res.status(404).json({ error: 'Company not found' });

  return res.json({ message: 'Evacuation plan saved', ...evacPlanPayload(company) });
});

router.post(
  '/companies/:company_code/evacuation-plan/upload',
  authenticate,
  superAdminOnly,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    evacuationUpload.single('plan_file')(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : 'File upload failed';
        return res.status(400).json({ error: message });
      }
      next();
    });
  },
  async (req: AuthRequest, res: Response) => {
    const company_code = String(req.params.company_code);
    const company = await store.findCompanyByCode(company_code);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'plan_file is required' });

    if (company.evacuation_plan_file) {
      deleteCompanyEvacFile(company_code, company.evacuation_plan_file);
    }

    const body = req.body as { assembly_point?: string; evacuation_plan?: string };
    const textFromFile = readTextPlanIfApplicable(file.path, file.mimetype);

    let evacuation_plan = company.evacuation_plan;
    if (body.evacuation_plan !== undefined && String(body.evacuation_plan).trim()) {
      evacuation_plan = String(body.evacuation_plan).trim();
    } else if (textFromFile) {
      evacuation_plan = textFromFile;
    }

    const updated = await store.updateCompany(company_code, {
      evacuation_plan_file: file.filename,
      evacuation_plan_file_name: file.originalname,
      evacuation_plan_file_mime: file.mimetype,
      ...(body.assembly_point !== undefined && { assembly_point: String(body.assembly_point).trim() }),
      evacuation_plan,
    });

    return res.json({ message: 'Evacuation plan file uploaded', ...evacPlanPayload(updated!) });
  }
);

router.delete('/companies/:company_code/evacuation-plan/file', authenticate, superAdminOnly, async (req: AuthRequest, res: Response) => {
  const company_code = String(req.params.company_code);
  const company = await store.findCompanyByCode(company_code);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  if (company.evacuation_plan_file) {
    deleteCompanyEvacFile(company_code, company.evacuation_plan_file);
  }

  const updated = await store.updateCompany(company_code, {
    evacuation_plan_file: '',
    evacuation_plan_file_name: '',
    evacuation_plan_file_mime: '',
  });

  return res.json({ message: 'Uploaded plan file removed', ...evacPlanPayload(updated!) });
});

router.delete('/companies/:company_code/evacuation-plan', authenticate, superAdminOnly, async (req: AuthRequest, res: Response) => {
  const company_code = String(req.params.company_code);
  const company = await store.findCompanyByCode(company_code);
  if (!company) return res.status(404).json({ error: 'Company not found' });

  if (company.evacuation_plan_file) {
    deleteCompanyEvacFile(company_code, company.evacuation_plan_file);
  }

  const updated = await store.updateCompany(company_code, {
    evacuation_plan: '',
    assembly_point: '',
    evacuation_plan_file: '',
    evacuation_plan_file_name: '',
    evacuation_plan_file_mime: '',
  });

  return res.json({ message: 'Evacuation plan deleted', ...evacPlanPayload(updated!) });
});

router.patch('/companies/:company_code/deactivate', authenticate, superAdminOnly, async (req: AuthRequest, res: Response) => {
  const { company_code } = req.params;
  const company = await store.deactivateCompany(String(company_code));
  if (!company) return res.status(404).json({ error: 'Company not found' });
  return res.json({ message: `Company ${company.name} deactivated` });
});

export default router;
