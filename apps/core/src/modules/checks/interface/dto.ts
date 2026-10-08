import type { CheckTemplate } from '../domain/check-template.js';

export function templateDto(t: CheckTemplate) {
  return {
    id: t.id,
    companyId: t.companyId,
    name: t.name,
    appliesTo: t.appliesTo,
    vehicleIds: t.vehicleIds,
    items: t.items,
    version: t.version,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}
