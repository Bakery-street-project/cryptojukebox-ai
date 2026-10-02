#!/usr/bin/env bash
# Dependabot remediation audit — invoked by .github/workflows/remediation-scan.yml
# Usage: run_audit.sh <repos.json> <output_dir>
# Contract with the workflow:
#   - writes <output_dir>/dependabot_alerts_<ts>.json  (flat JSON array, top-level .severity)
#   - writes <output_dir>/audit_summary_<ts>.txt       (plain-text summary)
set -euo pipefail

CONFIG_FILE="${1:?usage: run_audit.sh <repos.json> <output_dir>}"
OUTPUT_DIR="${2:?usage: run_audit.sh <repos.json> <output_dir>}"

command -v gh >/dev/null || { echo "ERROR: gh CLI required" >&2; exit 1; }
command -v jq >/dev/null || { echo "ERROR: jq required" >&2; exit 1; }
[ -f "$CONFIG_FILE" ] || { echo "ERROR: config not found: $CONFIG_FILE" >&2; exit 1; }

mkdir -p "$OUTPUT_DIR"
TS="$(date -u +%Y%m%d_%H%M%S)"
ALERTS_FILE="$OUTPUT_DIR/dependabot_alerts_${TS}.json"
SUMMARY_FILE="$OUTPUT_DIR/audit_summary_${TS}.txt"

TMP_ALERTS="$(mktemp)"
TMP_SKIP="$(mktemp)"
TMP_TARGETS="$(mktemp)"
trap 'rm -f "$TMP_ALERTS" "$TMP_SKIP" "$TMP_TARGETS"' EXIT
: > "$TMP_ALERTS"
: > "$TMP_SKIP"

expand_repo() {
  local owner="$1" name="$2"
  if [ "$name" = "*" ]; then
    gh api "orgs/${owner}/repos" --jq ".[] | \"${owner}/\" + .name" 2>>"$TMP_SKIP" || \
      echo "SKIPPED org ${owner}: repo listing failed" >> "$TMP_SKIP"
  else
    echo "${owner}/${name}"
  fi
}

while IFS=$'\t' read -r owner name enabled; do
  [ "$enabled" = "true" ] || continue
  expand_repo "$owner" "$name"
done < <(jq -r '.repositories[] | [.owner, .name, (.enabled | tostring)] | @tsv' "$CONFIG_FILE") \
  | sort -u > "$TMP_TARGETS"

while IFS=/ read -r owner repo; do
  [ -n "$repo" ] || continue
  echo "Auditing ${owner}/${repo} ..." >&2
  if ! alerts="$(gh api --paginate \
      "repos/${owner}/${repo}/dependabot/alerts?state=open&per_page=100" 2>>"$TMP_SKIP")"; then
    echo "SKIPPED ${owner}/${repo}: alerts API failed" >> "$TMP_SKIP"
    continue
  fi
  echo "$alerts" | jq -c --arg repo "${owner}/${repo}" \
    '[.[] | {repo: $repo,
             number: .number,
             state: .state,
             severity: (.security_advisory.severity // "unknown"),
             package: .dependency.package.name,
             ecosystem: .dependency.package.ecosystem,
             vulnerable_range: .dependency.scope,
             patch: (.fix_first_release_tag_name // .security_advisory.patched_versions // empty),
             html_url: .html_url}] | .[]' >> "$TMP_ALERTS"
done < "$TMP_TARGETS"

jq -s '.' "$TMP_ALERTS" > "$ALERTS_FILE"

TOTAL="$(jq 'length' "$ALERTS_FILE")"
CRITICAL="$(jq '[.[] | select(.severity == "critical")] | length' "$ALERTS_FILE")"
HIGH="$(jq '[.[] | select(.severity == "high")] | length' "$ALERTS_FILE")"
MODERATE="$(jq '[.[] | select(.severity == "moderate")] | length' "$ALERTS_FILE")"
LOW="$(jq '[.[] | select(.severity == "low")] | length' "$ALERTS_FILE")"
SKIPPED_COUNT="$(grep -c '^SKIPPED' "$TMP_SKIP" || true)"

{
  echo "Dependabot Remediation Audit — ${TS} UTC"
  echo "========================================="
  echo "Open alerts: ${TOTAL}  (critical: ${CRITICAL}, high: ${HIGH}, moderate: ${MODERATE}, low: ${LOW})"
  echo ""
  echo "Per-repository breakdown:"
  jq -r 'group_by(.repo)[] | "\(.[0].repo): \(length) open (\([.[].severity] | group_by(.) | map("\(.[0])=\(length)") | join(", ")))"' "$ALERTS_FILE"
  if [ "$CRITICAL" -gt 0 ]; then
    echo ""
    echo "CRITICAL alerts requiring immediate remediation:"
    jq -r '.[] | select(.severity == "critical") | "- \(.repo)#\(.number) \(.ecosystem)/\(.package) → \(.html_url)"' "$ALERTS_FILE"
  fi
  if [ "$SKIPPED_COUNT" -gt 0 ]; then
    echo ""
    echo "Skipped targets (${SKIPPED_COUNT}):"
    grep '^SKIPPED' "$TMP_SKIP"
  fi
} > "$SUMMARY_FILE"

cat "$SUMMARY_FILE"

echo "Results written to:" >&2
echo "  $ALERTS_FILE" >&2
echo "  $SUMMARY_FILE" >&2
