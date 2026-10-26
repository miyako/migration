"""Narrow evidence extraction and explicit editorial uncertainty composition."""
from __future__ import annotations

from copy import deepcopy
import re

from . import authoring as a

AUTHOR = """Write only a short English draft from the evidence and extracted
decision. one_line names the actual behavior/constraint; paragraph explains it
without speculation. conditions describe only the affected inputs/context.
Use 1-2 sentences in paragraph and 1-2 conditions. Preserve all required identifiers.
If an action is documented, preserve its exact OPTIONAL vs REQUIRED modality.
A guard controls whether handler code executes; don't claim it stops events.
Do not add instructions, versions, platforms, severity, motivations or fixes not
stated in the selected evidence. Do not label the behavior a bug fix.
For unknown remedy the schema supplies editorial sentinels. First-release
uncertainty is added separately by the caller; don't invent a date.
Citations are short reference labels. Put them ONLY in the citations array."""

TRANSLATE = """Translate exactly the supplied English field(s) into the target
language. Translate every natural-language word, including the first field.
Do not summarize or add/change facts, modality, conditions, numbers or uncertainty.
Only the exact protected_tokens listed in DATA are code tokens: copy them
byte-for-byte in the same fields. If the list is empty invent NO tokens.
Keep camelCase and other code identifiers unchanged. Citations are supplied by
the caller, not prose. Fixed schema values are editorial sentinels, not text to
reinterpret. Return only the requested JSON."""
SELECT_CHANGE = """Select a quote that states what specifically changed.
Use unknown when the evidence only announces updates/possible compatibility
issues without describing an actual behavior, or is rhetorical/irrelevant.
A statement that work is not required alone is not a change.
A precise before/after result, deprecation, prohibition, or conditional compatibility
guard counts as a specific change. Copy the chosen quote exactly, without its label.
type is behavior-change for returned values/events/handler behavior; restriction
for an explicitly forbidden name/use; deprecation for discouraged available features;
removal for explicitly unavailable features; unknown when no specific change exists.
Generic "some behaviors changed" has no specific input/result: quote and type unknown."""
SELECT_RELEASE = """Select the first release explicitly dated in the supplied
quotes for this change. Return a release from allowed_releases, otherwise unknown.
A dated update introduction may date the concrete behavior alongside it.
Never infer the release from a source edition. Do not include 4D or v prefixes."""
SELECT_ACTION = """Select a quote containing a POSITIVE action instruction.
This includes optional suggestions ("you can add", "recommend") and mandatory
requirements ("must"). Copy that quote exactly; use unknown if no instruction.
Prefer the prose instruction over its code example. A mere behavior/result or
"replacement is not required" is NOT an action instruction.
modality is optional for can/may/recommend; required only for an explicit must;
unknown when the quote is unknown. Don't require a command name in an instruction."""

UNCERTAINTY = {
    "en": "The first release is unknown.",
    "fr": "La première version concernée est inconnue.",
    "de": "Die erste betroffene Version ist unbekannt.",
    "es": "Se desconoce la primera versión afectada.",
    "ja": "最初の対象リリースは不明です。",
}
NO_REMEDY = {
    "en": ("The supplied evidence does not establish a remedy.",
           "No remediation instruction is stated in these quotes."),
    "fr": ("Les éléments fournis n'établissent aucune mesure corrective.",
           "Ces citations ne contiennent aucune instruction de remédiation."),
    "de": ("Die vorliegenden Belege nennen keine Abhilfe.",
           "Diese Zitate enthalten keine Anweisung zur Abhilfe."),
    "es": ("Las pruebas proporcionadas no establecen una medida correctiva.",
           "Estas citas no contienen instrucciones de corrección."),
    "ja": ("提示された根拠では対処方法は確認できません。",
           "これらの引用には対処の指示がありません。"),
}


def extraction_schema(labels):
    reference = {"type": "string", "enum": ["unknown", *labels]}
    return a.object_schema({
        "specific_ref": dict(reference), "threshold_ref": dict(reference),
        "first_release": {"type": "string"},
        "action_ref": dict(reference),
        "modality": {"type": "string", "enum": ["unknown", "optional", "required"]},
        "type": {"type": "string", "enum": ["unknown", "behavior-change", "restriction",
                                           "deprecation", "removal"]},
    })


def validate_extraction(value, schema, labeled):
    a.validate_schema(value, schema)
    if value["specific_ref"] == "unknown":
        a.require(all(value[field] == "unknown" for field in
                      ("specific_ref", "threshold_ref", "first_release", "action_ref", "modality", "type")),
                  "Insufficient evidence cannot establish change metadata")
    if value["threshold_ref"] == "unknown":
        a.require(value["first_release"] == "unknown", "Uncited first release must remain unknown")
    else:
        quote = labeled[value["threshold_ref"]]["quote"]
        release = value["first_release"]
        a.require(re.fullmatch(r"\d{2}(?:\.\d+)?(?: R\d+)?", release) and release in quote,
                  "Extracted first release must occur in the selected threshold quote")
    a.require((value["action_ref"] == "unknown") == (value["modality"] == "unknown"),
              "Action evidence and modality must agree; optional is not unknown")


def decision_from(extraction, labeled):
    labels = list(dict.fromkeys(extraction[key] for key in
                  ("specific_ref", "threshold_ref", "action_ref") if extraction[key] != "unknown"))
    if not labels:
        labels = list(labeled)
    return {
        "disposition": "insufficient" if extraction["specific_ref"] == "unknown" else "draft",
        "threshold": extraction["first_release"],
        "platforms": ["unknown"],
        "remedy": "documented" if extraction["action_ref"] != "unknown" else "unknown",
        "complexity": "unknown", "criticality": "unknown",
        "type": extraction["type"],
        "extraction": {**extraction,
                       "evidence": {key: a.citation_key(labeled[key]) for key in labeled}},
        "citations": [a.citation_key(labeled[key]) for key in labels],
    }


def prose_schema(base, decision, language):
    result = deepcopy(base)
    if decision["remedy"] == "unknown":
        for field, text in zip(("action", "action_basis"), NO_REMEDY[language]):
            result["properties"][field]["enum"] = [text]
    return result


def compose(prose, decision, language):
    result = deepcopy(prose)
    if decision["threshold"] == "unknown":
        result["paragraph"] += " " + UNCERTAINTY[language]
    return result


def expand_refs(prose, labeled):
    result = deepcopy(prose)
    a.require(all(label in labeled for label in result["citations"]), "Invented short evidence reference")
    result["citations"] = [a.citation_key(labeled[label]) for label in result["citations"]]
    return result


def validate_modality(prose, decision):
    if decision["extraction"]["modality"] == "optional":
        text = " ".join([prose["one_line"], prose["paragraph"], prose["action"]])
        a.require(not re.search(r"\b(?:must|required|mandatory|necessary)\b", text, re.I),
                  "Optional evidence must not become mandatory work")
        a.require(re.search(r"\b(?:can|may|optional|optionally)\b", prose["action"], re.I),
                  "Documented optional action must remain explicitly optional")


def action_candidates(quotes):
    positive = (r"\b(?:you can|you must|must (?:add|replace|use)|recommend(?:ed)?|"
                r"pouvez|devez|recommandons)\b|(?:追加することができます|推奨)")
    return [quote for quote in quotes if re.search(positive, re.sub(
        r"\b(?:not|never)\s+recommended\b", "", quote, flags=re.I), re.I)]


def extract(labeled, config, client):
    quotes = list(dict.fromkeys(item["quote"] for item in labeled.values()))
    quote_schema = {"type": "string", "maxLength": 1000, "enum": quotes}
    type_schema = extraction_schema(list(labeled))["properties"]["type"]
    schema = a.object_schema({"type": type_schema})
    data = {"quotes": quotes}
    change_type = a.checked_generate(client, "classify_change",
        SELECT_CHANGE + "\nReturn only type; unknown means insufficient specific evidence.",
        data, schema, lambda result: a.validate_schema(result, schema), config)["type"]
    if change_type == "unknown":
        return {"specific_ref": "unknown", "threshold_ref": "unknown", "first_release": "unknown",
                "action_ref": "unknown", "modality": "unknown", "type": "unknown"}
    schema = a.object_schema({"quote": quote_schema})
    change = a.checked_generate(client, "select_change",
        "Copy the exact quote supporting the classified change, with no alterations.",
        {**data, "type": change_type}, schema, lambda result: a.validate_schema(result, schema), config)
    by_quote = {item["quote"]: label for label, item in labeled.items()}
    releases = sorted(set().union(*(a.explicit_releases(quote) for quote in quotes)))
    release_schema = a.object_schema({"release": {"type": "string", "enum": ["unknown", *releases]}})
    release = a.checked_generate(client, "select_release", SELECT_RELEASE,
        {"quotes": quotes, "specific_quote": change["quote"], "allowed_releases": releases},
        release_schema, lambda result: a.validate_schema(result, release_schema), config)["release"]
    action_quotes = action_candidates(quotes)
    action_schema = a.object_schema({
        "quote": {"type": "string", "maxLength": 1000, "enum": ["unknown", *action_quotes]},
        "modality": {"type": "string", "enum": ["unknown", "optional", "required"]}})

    def validate_action(result):
        a.validate_schema(result, action_schema)
        a.require((result["quote"] == "unknown") == (result["modality"] == "unknown"),
                  "Action quote and modality must agree")

    if action_quotes:
        action = a.checked_generate(client, "select_action", SELECT_ACTION,
            {"quotes": action_quotes}, action_schema, validate_action, config)
    else:
        action = {"quote": "unknown", "modality": "unknown"}
    return {
        "specific_ref": by_quote[change["quote"]],
        "threshold_ref": next((label for label, item in labeled.items()
                               if release in a.explicit_releases(item["quote"])), "unknown"),
        "first_release": release,
        "action_ref": by_quote.get(action["quote"], "unknown"),
        "modality": action["modality"], "type": change_type}


def generate(value, config, client):
    evidence = value["evidence"]
    labeled = {f"E{i+1}": item for i, item in enumerate(evidence)}
    data = {"evidence": [{"ref": label, "quote": item["quote"]} for label, item in labeled.items()]}
    extraction = extract(labeled, config, client)
    validate_extraction(extraction, extraction_schema(list(labeled)), labeled)
    decision = decision_from(extraction, labeled)
    a.validate_decision(decision, a.schemas(decision["citations"])[0], evidence)
    if decision["disposition"] == "insufficient":
        return {"decision": decision, "localizations": {}, "patch": []}

    short_schema = prose_schema(a.schemas(list(labeled))[1], decision, "en")
    short_schema["properties"].pop("citations")
    short_schema["required"].remove("citations")
    full_schema = prose_schema(a.schemas([a.citation_key(e) for e in evidence])[1], decision, "en")
    data.update(extraction=extraction, required_identifiers=a.identifiers(evidence, "en"))
    def with_action(result):
        return {**result, "citations": list(labeled)}

    def validate_english(result):
        a.validate_schema(result, short_schema)
        expanded = compose(expand_refs(with_action(result), labeled), decision, "en")
        a.validate_prose(expanded, full_schema, "en", evidence)
        validate_modality(expanded, decision)

    raw_english = a.checked_generate(client, "en", AUTHOR, data, short_schema, validate_english, config)
    english_body = expand_refs(with_action(raw_english), labeled)
    english = compose(english_body, decision, "en")
    localizations = {"en": english}
    protected, mapping = a.protect_identifiers(english_body, evidence)
    language_names = {"fr": "French", "de": "German", "es": "Spanish", "ja": "Japanese"}
    for language in a.LANGUAGES[1:]:
        instruction = TRANSLATE + "\nTarget language: " + language_names[language] + "."
        line_schema = a.object_schema({"text": short_schema["properties"]["one_line"]})
        line_data = {"language": language_names[language], "text": protected["one_line"],
                     "protected_tokens": list(dict.fromkeys(
                         re.findall(r"__CMD_\d+__", protected["one_line"])))}

        def validate_line(result):
            a.validate_schema(result, line_schema)
            a.require(result["text"] != protected["one_line"], "One-line must be translated, not copied")
            source_tokens = re.findall(r"__CMD_\d+__", protected["one_line"])
            a.require(sorted(re.findall(r"__CMD_\d+__", result["text"])) == sorted(source_tokens),
                      "One-line translation changed protected identifiers")
            if language == "ja":
                restored = result["text"]
                for token, name in mapping.items():
                    restored = restored.replace(token, name)
                a.validate_japanese_text(restored, "one_line", a.identifiers(evidence, "ja"))

        line = a.checked_generate(client, language + ".one_line", instruction, line_data,
                                  line_schema, validate_line, config)["text"]
        body_schema = prose_schema(a.schemas(list(labeled))[1], decision, language)
        body_schema["properties"].pop("one_line")
        body_schema["properties"].pop("citations")
        body_schema["required"] = list(body_schema["properties"])
        body_data = {"language": language_names[language],
                     "english": {key: protected[key] for key in body_schema["required"]},
                     "protected_tokens": list(dict.fromkeys(re.findall(
                         r"__CMD_\d+__", str({key: protected[key] for key in body_schema["required"]}))))}

        def assemble(result):
            result = {**result, "one_line": line, "citations": english_body["citations"]}
            return compose(a.restore_identifiers(result, mapping, language, evidence), decision, language)

        def validate_translation(result):
            a.validate_schema(result, body_schema)
            restored = assemble(result)
            a.validate_prose(restored, prose_schema(a.schemas(english["citations"])[1], decision, language),
                             language, evidence, english)

        body = a.checked_generate(client, language + ".body", instruction, body_data,
                                  body_schema, validate_translation, config)
        localizations[language] = assemble(body)
    return {"decision": decision, "localizations": localizations,
            "patch": a.patch_entries(value, localizations)}
