import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    const parentUrl = context.parentURL ?? ''
    const inProjectSource = parentUrl.includes('/server/src/')
    const isRelativeOrAbsolute =
      specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/')

    if (inProjectSource && isRelativeOrAbsolute && !specifier.match(/\.[a-zA-Z0-9]+$/)) {
      return nextResolve(`${specifier}.ts`, context)
    }
    return nextResolve(specifier, context)
  },
})
