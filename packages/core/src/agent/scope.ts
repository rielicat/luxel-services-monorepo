export function propertyScopeKey(propertyId: string): string {
  return `property:${propertyId}`;
}

export function hostScopeKey(customerId: string): string {
  return `host:${customerId}`;
}

export function pricingScopeKey(propertyId: string): string {
  return `pricing:${propertyId}`;
}
