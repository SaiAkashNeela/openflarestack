const EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json']

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve)
  } catch (error) {
    if (!isRelativeOrAbsolute(specifier)) {
      throw error
    }

    for (const suffix of EXTENSIONS) {
      try {
        return await defaultResolve(`${specifier}${suffix}`, context, defaultResolve)
      } catch {
        // Keep trying the next extension.
      }
    }

    if (specifier.endsWith('/')) {
      for (const suffix of EXTENSIONS) {
        try {
          return await defaultResolve(`${specifier}index${suffix}`, context, defaultResolve)
        } catch {
          // Keep trying the next index candidate.
        }
      }
    }

    throw error
  }
}

function isRelativeOrAbsolute(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')
}
