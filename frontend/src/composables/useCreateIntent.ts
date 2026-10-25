import type { LocationQuery, Router } from "vue-router";

/** True when the link asked to open the "new record" form (`?new=1`); the flag is removed so a refresh does not reopen it. */
export function consumeCreateIntent(query: LocationQuery, router: Router): boolean {
  if (query.new !== "1") return false;
  const { new: _new, ...rest } = query;
  void router.replace({ query: rest });
  return true;
}
