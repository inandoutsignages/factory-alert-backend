import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';

export const UPLOADS_ROOT = path.join(__dirname, '../../uploads');
export const EVAC_UPLOADS_DIR = path.join(UPLOADS_ROOT, 'evacuation-plans');

const ALLOWED_MIME: Record<string, string> = {
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

const MAX_BYTES = 10 * 1024 * 1024;

export function ensureUploadDirs() {
  fs.mkdirSync(EVAC_UPLOADS_DIR, { recursive: true });
}

export function companyEvacDir(companyCode: string) {
  return path.join(EVAC_UPLOADS_DIR, companyCode);
}

export function evacuationFileUrl(companyCode: string, storedName: string) {
  if (!storedName) return '';
  return `/uploads/evacuation-plans/${companyCode}/${storedName}`;
}

export function deleteCompanyEvacFile(companyCode: string, storedName: string) {
  if (!storedName) return;
  const filePath = path.join(companyEvacDir(companyCode), storedName);
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn('[evac] could not delete file:', filePath, err);
  }
}

export function readTextPlanIfApplicable(filePath: string, mime: string): string | null {
  if (mime !== 'text/plain') return null;
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return null;
  }
}

export const evacuationUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const companyCode = String(req.params.company_code || 'unknown');
      const dir = companyEvacDir(companyCode);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ALLOWED_MIME[file.mimetype] || '';
      cb(null, `${uuidv4()}${ext.toLowerCase()}`);
    },
  }),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExt = ['.pdf', '.txt', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx'];
    if (ALLOWED_MIME[file.mimetype] || allowedExt.includes(ext)) {
      cb(null, true);
      return;
    }
    cb(new Error('Only PDF, TXT, Word, or image files are allowed (max 10MB)'));
  },
});

export interface CompanyEvacFileFields {
  evacuation_plan_file: string;
  evacuation_plan_file_name: string;
  evacuation_plan_file_mime: string;
}

export const emptyEvacFileFields = (): CompanyEvacFileFields => ({
  evacuation_plan_file: '',
  evacuation_plan_file_name: '',
  evacuation_plan_file_mime: '',
});

export function hasEvacuationPlan(company: {
  evacuation_plan?: string;
  assembly_point?: string;
  evacuation_plan_file?: string;
}) {
  return !!(company.evacuation_plan || company.assembly_point || company.evacuation_plan_file);
}

export function evacPlanPayload(company: {
  company_code: string;
  evacuation_plan?: string;
  assembly_point?: string;
  evacuation_plan_file?: string;
  evacuation_plan_file_name?: string;
  evacuation_plan_file_mime?: string;
}) {
  const file = company.evacuation_plan_file || '';
  return {
    evacuation_plan: company.evacuation_plan || '',
    assembly_point: company.assembly_point || '',
    evacuation_plan_file_url: file ? evacuationFileUrl(company.company_code, file) : '',
    evacuation_plan_file_name: company.evacuation_plan_file_name || '',
    evacuation_plan_file_mime: company.evacuation_plan_file_mime || '',
    has_file: !!file,
  };
}
