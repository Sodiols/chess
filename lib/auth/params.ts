import { safeNext } from "./validation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The sanitised `?next=` of a page's search params. */
export async function nextParam(searchParams: SearchParams, fallback = "/play"): Promise<string> {
  const { next } = await searchParams;
  return safeNext(Array.isArray(next) ? next[0] : next, fallback);
}
