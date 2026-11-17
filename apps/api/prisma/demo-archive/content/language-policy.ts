import { corpus } from "../model.js";

export function assertEnglishSynthetic(content: string): void {
  if (!content.includes(corpus.notice))
    throw new Error("Standalone synthetic notice missing.");
  if (/\p{Script=Cyrillic}/u.test(content))
    throw new Error("Corpus content must be English.");
  if (/\{\{|\}\}|\b(?:TODO|TBD|lorem ipsum|placeholder)\b/i.test(content))
    throw new Error("Unresolved authored content.");
}

export function assertOriginalTemplate(template: {
  provenance: string;
  official_form: boolean;
  permission_to_reproduce: boolean;
}): void {
  // This archive deliberately excludes actual forms, even if a later permission exists.
  if (template.provenance !== "original-synthetic" || template.official_form)
    throw new Error(
      "Only original synthetic templates are approved; no official or copied licensed forms.",
    );
}
