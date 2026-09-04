export function propertyScopeKey(propertyId: string): string {
  return `property:${propertyId}`;
}

export function hostScopeKey(customerId: string): string {
  return `host:${customerId}`;
}
