// Konstanta paginasi dipisah dari lib/data.ts (server-only) supaya aman
// diimpor client component (module-workspace) tanpa menyeret pg ke bundle.
export const MODULE_PAGE_SIZE = 15;
