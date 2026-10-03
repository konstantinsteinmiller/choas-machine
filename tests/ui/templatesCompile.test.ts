// Every component's template compiles the way the dev server compiles it.
//
// vue-tsc checks the script and the bindings, but a pug template that does not
// parse (a stray style rule pasted into it, say) or a template expression with
// TypeScript syntax in it (`x!`, `as Foo`) passes the type-check and then fails
// in the browser: the route does not load and the game is a blank page. Twice
// in one round a patch put CSS into a template; this is what catches it.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileTemplate, parse } from 'vue/compiler-sfc'

const ROOT = join(__dirname, '..', '..', 'src')

const vueFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? vueFiles(p) : name.endsWith('.vue') ? [p] : []
  })

/** Non-null assertions and `as` casts, which the runtime compiler cannot read. */
const TS_IN_EXPRESSION = /(\w|\)|\])!(?=[.\[)\s,}]|$)|\sas\s+[A-Z]\w*/

describe('every template compiles', () => {
  for (const file of vueFiles(ROOT)) {
    const name = relative(ROOT, file).replace(/\\/g, '/')
    it(name, () => {
      const { descriptor, errors } = parse(readFileSync(file, 'utf8'), { filename: file })
      expect(errors.map(String)).toEqual([])
      if (!descriptor.template) return
      const out = compileTemplate({
        id: 'x',
        filename: file,
        source: descriptor.template.content,
        preprocessLang: descriptor.template.lang,
        // As @vitejs/plugin-vue calls pug: boolean attributes stay boolean.
        preprocessOptions: { doctype: 'html' }
      })
      expect(out.errors.map(String)).toEqual([])
      // Expressions only: the bound attributes and the interpolations.
      const expressions = [
        ...descriptor.template.content.matchAll(/[:@#][\w.-]+(?:\([^)]*\))?="([^"]*)"/g),
        ...descriptor.template.content.matchAll(/\{\{([^}]*)\}\}/g)
      ].map(m => m[1]!)
      expect(expressions.filter(e => TS_IN_EXPRESSION.test(e) && !/!==?/.test(e.replace(TS_IN_EXPRESSION, '')))).toEqual([])
    })
  }
})
