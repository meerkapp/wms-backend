export const ALL_PERMISSIONS = [
  'employee.select',
  'employee.create',
  'employee.update',
  'employee.delete',
  'product_item.select',
  'product_item.create',
  'product_item.update',
  'product_item.delete',
  'invoice.arrival.select',
  'invoice.arrival.create',
  'invoice.arrival.create_completed',
  'invoice.arrival.update',
  'invoice.arrival.delete',
  'invoice.transfer.select',
  'invoice.transfer.create',
  'invoice.transfer.create_completed',
  'invoice.transfer.update',
  'invoice.transfer.delete',
  'report.select',
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];
