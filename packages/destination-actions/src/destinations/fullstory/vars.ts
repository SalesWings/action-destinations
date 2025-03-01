import camelCase from 'lodash/camelCase'

const isString = (x: any) => typeof x === 'string'

const isBool = (x: any) => typeof x === 'boolean'

const isReal = (x: any) => typeof x === 'number'

const isInt = (x: any) => typeof x === 'number' && x - Math.floor(x) === 0

const isDate = (x: any) => {
  if (!x) {
    return false
  }
  if (x.constructor === Date) {
    return !isNaN(x as any)
  }
  return false
}

const isArrayOf = (f: (val: any) => boolean) => {
  return function (x: any): boolean {
    if (!(x instanceof Array)) {
      return false
    }
    for (let i = 0; i < x.length; i++) {
      if (!f(x[i])) {
        return false
      }
    }
    return true
  }
}

const isObject = (x: any) => x && typeof x === 'object'

const typeValidators: Readonly<Record<string, (_: any) => boolean>> = {
  str: isString,
  bool: isBool,
  real: isReal,
  // Even though we won't infer an int type suffix since real will be preferred, we maintain int and
  // ints in this map since keys are also used to check for known type suffixes which we preserve.
  int: isInt,
  date: isDate,
  strs: isArrayOf(isString),
  bools: isArrayOf(isBool),
  reals: isArrayOf(isReal),
  ints: isArrayOf(isInt),
  dates: isArrayOf(isDate),
  objs: isArrayOf(isObject),
  obj: isObject
}

const inferType = (value: any) => {
  for (const t in typeValidators) {
    if (typeValidators[t](value)) {
      return t
    }
  }
  return null
}

const isKnownTypeSuffix = (suffix: string) => !!typeValidators[suffix]

const invalidPropertyNameCharRegex = /[^A-Za-z0-9_]/g

/**
 * Strips characters not supported by FullStory user vars or custom event vars from property names.
 * Does not preserve type suffixes. Intended to be used with {@link transformPropertyName} which
 * does preserve type suffixes.
 *
 * @param text The text from which to remove unsupported characters
 * @returns The original text excluding any unsupported characters
 */
const stripCharsNotSupportedInPropertyNames = (text: string) => {
  return text.replace(invalidPropertyNameCharRegex, '')
}

/**
 * If the given property name doesn't already include a known type suffix, attempts to infer a
 * type suffix from the property's value. If a type can be inferred from the property's value,
 * returns a new version of the property name with that type's suffix appended. Otherwise, returns
 * the original property name.
 *
 * @param name The property name
 * @param value The value for the given property
 * @returns The original property name if it already included a known type suffix; otherwise
 *          the property name with a type suffix inferred from its value
 */
const typeSuffixPropertyName = (name: string, value: unknown) => {
  const valueTypeName = typeof value

  if (valueTypeName === 'undefined') {
    // We can't infer the type for undefined values
    return name
  }

  const lastUnderscore = name.lastIndexOf('_')

  if (lastUnderscore === -1 || !isKnownTypeSuffix(name.substring(lastUnderscore + 1))) {
    // Either no type suffix or the name contains an underscore with an unknown suffix.
    const maybeType = inferType(value)
    if (maybeType === null) {
      // We can't infer the type. Don't change the property name.
      return name
    }

    return `${name}_${maybeType}`
  }

  return name
}

type PropertyNameTransformation = (_: string) => string

/**
 * Applies given transformations to a property name, preserving any known type suffixes in the
 * original property name.
 *
 * @param name The full original property name
 * @param transformations The transformations which will be applied to the original property name
 * @returns The transformed property name, preserving any known type suffixes.
 */
const transformPropertyName = (name: string, transformations: PropertyNameTransformation[]) => {
  const parts = name.split('_')

  const transform = (original: string) =>
    transformations.reduce((target, transformation) => {
      return transformation(target)
    }, original)

  if (parts.length > 1) {
    const typeSuffix = parts.pop()
    if (typeSuffix && typeValidators[typeSuffix]) {
      return transform(parts.join('_')) + `_${typeSuffix}`
    }
  }

  return transform(name)
}

/**
 * Normalizes first level property names according to FullStory API custom var expectations. Type suffixes
 * will be added to first level property names when a known type suffix isn't present and the type can be
 * inferred. First level property names will also be camel cased if specified, preserving any known type
 * suffixes. Finally, any unsupported characters will be stripped from property names.
 *
 * @param obj The source object.
 * @param options Extended normalization options, including whether to camel case property names.
 * @returns A new object with first level property names normalized.
 */
export const normalizePropertyNames = (obj?: {}, options?: { camelCase?: boolean }): Record<string, unknown> => {
  if (!obj) {
    return {}
  }

  const transformations: PropertyNameTransformation[] = []
  if (options?.camelCase) {
    transformations.push(camelCase)
  }
  transformations.push(stripCharsNotSupportedInPropertyNames)

  const normalizePropertyName = (name: string, value: unknown) => {
    const transformedName = transformPropertyName(name, transformations)
    return typeSuffixPropertyName(transformedName, value)
  }

  return Object.entries(obj).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [normalizePropertyName(key, value)]: value
    }),
    {}
  )
}
