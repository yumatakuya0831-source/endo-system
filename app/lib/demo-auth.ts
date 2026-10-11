export const demoAdminId = "dev-demo-admin";
export const demoAdminEmail = "admin@demo.invalid";

export function isDemoIdentity(identifier: string) {
  const normalized = identifier.trim().toLowerCase();
  return normalized === "admin" || normalized === demoAdminEmail;
}

export function canLoginAsDemo(identifier: string, password: string, environment: string | undefined) {
  return environment === "development" && isDemoIdentity(identifier) && password === "admin";
}
