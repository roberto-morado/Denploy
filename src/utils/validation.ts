import { isValidEmail, isValidSubdomain } from "./security.ts";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateUserRegistration(
  email: string,
  password: string,
  name: string
): ValidationResult {
  const errors: string[] = [];

  if (!email || !isValidEmail(email)) {
    errors.push("Invalid email address");
  }

  if (!password || password.length < 8) {
    errors.push("Password must be at least 8 characters long");
  }

  if (password && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (password && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (password && !/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  if (!name || name.trim().length === 0) {
    errors.push("Name is required");
  }

  if (name && name.length > 100) {
    errors.push("Name must be less than 100 characters");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateLogin(email: string, password: string): ValidationResult {
  const errors: string[] = [];

  if (!email || !isValidEmail(email)) {
    errors.push("Invalid email address");
  }

  if (!password) {
    errors.push("Password is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateAppName(name: string): ValidationResult {
  const errors: string[] = [];

  if (!name || name.trim().length === 0) {
    errors.push("App name is required");
  }

  if (name && name.length > 50) {
    errors.push("App name must be less than 50 characters");
  }

  if (name && !/^[a-zA-Z0-9-_ ]+$/.test(name)) {
    errors.push("App name can only contain letters, numbers, spaces, hyphens, and underscores");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateSubdomain(subdomain: string): ValidationResult {
  const errors: string[] = [];

  if (!subdomain || subdomain.trim().length === 0) {
    errors.push("Subdomain is required");
  }

  if (subdomain && !isValidSubdomain(subdomain)) {
    errors.push("Invalid subdomain format. Must start and end with alphanumeric, contain only lowercase letters, numbers, and hyphens");
  }

  if (subdomain && subdomain.length < 3) {
    errors.push("Subdomain must be at least 3 characters long");
  }

  // Reserved subdomains
  const reserved = ["www", "api", "admin", "dashboard", "mail", "ftp", "ssh"];
  if (reserved.includes(subdomain.toLowerCase())) {
    errors.push("This subdomain is reserved");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateEnvVar(key: string, value: string): ValidationResult {
  const errors: string[] = [];

  if (!key || key.trim().length === 0) {
    errors.push("Environment variable key is required");
  }

  if (key && !/^[A-Z_][A-Z0-9_]*$/.test(key)) {
    errors.push("Environment variable key must be uppercase letters, numbers, and underscores");
  }

  if (value === undefined || value === null) {
    errors.push("Environment variable value is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateSSHPublicKey(publicKey: string): ValidationResult {
  const errors: string[] = [];

  if (!publicKey || publicKey.trim().length === 0) {
    errors.push("SSH public key is required");
  }

  // Basic SSH key format check
  const sshKeyRegex = /^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp256) [A-Za-z0-9+/]+=* .+$/;
  if (publicKey && !sshKeyRegex.test(publicKey.trim())) {
    errors.push("Invalid SSH public key format");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateFileUpload(
  fileName: string,
  fileSize: number,
  maxSizeMB: number
): ValidationResult {
  const errors: string[] = [];

  if (!fileName || fileName.trim().length === 0) {
    errors.push("File name is required");
  }

  const allowedExtensions = [".ts", ".tsx", ".js", ".jsx", ".zip"];
  const extension = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();

  if (!allowedExtensions.includes(extension)) {
    errors.push(`File type not allowed. Allowed types: ${allowedExtensions.join(", ")}`);
  }

  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (fileSize > maxSizeBytes) {
    errors.push(`File size exceeds maximum of ${maxSizeMB}MB`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
