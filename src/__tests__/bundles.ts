/**
 * Test-only template bundles.
 *
 * The package ships no templates, so the tests bring their own. These files
 * live in `test-fixtures/` — outside `src/`, imported only from here and from
 * `scripts/` — so they are absent from `dist/` and from the npm tarball.
 *
 * They are committed anyway, so CI can run the fidelity tests. See the README's
 * *Supplying a bundle* for why the package itself does not ship them.
 */

import { createTemplateMatcher } from "../template-matcher.js";
import type { BlogLocale, TemplateBundle, TemplateMatcher } from "../types.js";

import blogTemplatesDe from "../../test-fixtures/templates/blog-templates.de.json" with { type: "json" };
import blogTemplatesEn from "../../test-fixtures/templates/blog-templates.en.json" with { type: "json" };
import blogTemplatesEs from "../../test-fixtures/templates/blog-templates.es.json" with { type: "json" };
import blogTemplatesEsLa from "../../test-fixtures/templates/blog-templates.es_la.json" with { type: "json" };
import blogTemplatesFr from "../../test-fixtures/templates/blog-templates.fr.json" with { type: "json" };
import blogTemplatesIt from "../../test-fixtures/templates/blog-templates.it.json" with { type: "json" };
import blogTemplatesPtbr from "../../test-fixtures/templates/blog-templates.ptbr.json" with { type: "json" };

/** Raw bundles, for tests that inspect the strings themselves. */
export const bundles: Readonly<Record<BlogLocale, TemplateBundle>> = {
  de: blogTemplatesDe,
  en: blogTemplatesEn,
  es: blogTemplatesEs,
  es_la: blogTemplatesEsLa,
  fr: blogTemplatesFr,
  it: blogTemplatesIt,
  ptbr: blogTemplatesPtbr,
};

/** One compiled matcher per locale, built once for the whole suite. */
export const matchers: Readonly<Record<BlogLocale, TemplateMatcher>> = {
  de: createTemplateMatcher(bundles.de),
  en: createTemplateMatcher(bundles.en),
  es: createTemplateMatcher(bundles.es),
  es_la: createTemplateMatcher(bundles.es_la),
  fr: createTemplateMatcher(bundles.fr),
  it: createTemplateMatcher(bundles.it),
  ptbr: createTemplateMatcher(bundles.ptbr),
};

/** The English matcher. Every real fixture in this repo is English. */
export const english = matchers.en;
