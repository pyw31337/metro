export const DEPLOY_BASE_PATH =
  process.env.NEXT_PUBLIC_DEPLOY_TARGET === "firebase" ? "" : "/metro";

export function withDeployBase(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${DEPLOY_BASE_PATH}${normalized}` || "/";
}
