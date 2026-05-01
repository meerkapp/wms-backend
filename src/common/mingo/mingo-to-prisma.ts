type MingoOperator = Record<string, unknown>

function convertValue(value: unknown): unknown {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value)
  }
  return value
}

function convertCondition(field: string, condition: unknown): Record<string, unknown> {
  if (condition === null || typeof condition !== 'object') {
    return { [field]: convertValue(condition) }
  }

  const ops = condition as MingoOperator
  const prismaCondition: Record<string, unknown> = {}

  for (const [op, val] of Object.entries(ops)) {
    switch (op) {
      case '$eq':  prismaCondition[field] = { equals: convertValue(val) }; break
      case '$ne':  prismaCondition[field] = { not: convertValue(val) }; break
      case '$gt':  prismaCondition[field] = { gt: convertValue(val) }; break
      case '$gte': prismaCondition[field] = { gte: convertValue(val) }; break
      case '$lt':  prismaCondition[field] = { lt: convertValue(val) }; break
      case '$lte': prismaCondition[field] = { lte: convertValue(val) }; break
      case '$in':  prismaCondition[field] = { in: (val as unknown[]).map(convertValue) }; break
      case '$nin': prismaCondition[field] = { notIn: (val as unknown[]).map(convertValue) }; break
      default: break
    }
  }

  return prismaCondition
}

export function mingoToPrisma(selector: Record<string, unknown>): Record<string, unknown> {
  const where: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(selector)) {
    if (key === '$and') {
      where.AND = (value as Record<string, unknown>[]).map(mingoToPrisma)
    } else if (key === '$or') {
      where.OR = (value as Record<string, unknown>[]).map(mingoToPrisma)
    } else if (key === '$nor') {
      where.NOT = { OR: (value as Record<string, unknown>[]).map(mingoToPrisma) }
    } else {
      Object.assign(where, convertCondition(key, value))
    }
  }

  return where
}
