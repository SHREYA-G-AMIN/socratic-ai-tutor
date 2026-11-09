/**
 * Lets the plain Node test runner import the project source files.
 *
 * Two small differences between Node and Next.js have to be bridged:
 *
 *  1. `import "server-only"` is a Next.js build-time guard, not a real
 *     package. On the server it resolves to an empty module, so it is
 *     replaced with an empty module here.
 *
 *  2. Next.js lets a module import a sibling without a file extension
 *     (`./constants`). Node's ESM loader insists on the full file name, so
 *     an extensionless relative import is retried with `.ts` added.
 *
 * Nothing here changes the code under test: the real, unmodified source
 * files are loaded and executed.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      url: "data:text/javascript,export default {};",
      shortCircuit: true,
    };
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }

    throw error;
  }
}
