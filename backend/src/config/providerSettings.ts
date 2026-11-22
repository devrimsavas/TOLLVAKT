// Explains why a provider could not be created from backend/.env,
// naming the setting that is missing or wrong.
export function providerSetupProblem(
  providerVariable: string,
  required: Record<string, string[]>,
): string {
  const env = process.env;
  const provider = env[providerVariable]?.trim();
  const known = [...Object.keys(required), "fake"].join(", ");
  if (!provider) return `${providerVariable} is not set in backend/.env`;
  const names = required[provider];
  if (!names) return `${providerVariable}=${provider} is not one of: ${known}`;
  const missing = names.filter((name) => !env[name]?.trim());
  return `${missing.join(" and ")} missing in backend/.env (${providerVariable}=${provider})`;
}
