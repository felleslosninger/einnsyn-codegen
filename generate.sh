#!/bin/bash
# Usage: ./generate.sh <spec.tsp> <target-project-dir>
# Example: ./generate.sh ../einnsyn-api-spec/typespec/einnsyn.tsp ../einnsyn-backend
#
# Removes files marked "// Auto-generated from our API specification" from the
# target source directory before generating, so deleted classes don't leave
# stale files. All code is emitted into a temporary directory first, then the
# selected target subtree is copied into the target project and formatted from
# the project root.

set -e

USAGE="Usage: ./generate.sh <spec.tsp> <target-project-dir>"

[ "$#" -eq 2 ] || {
  echo "$USAGE" >&2
  exit 1
}

SPEC=${1:?$USAGE}
TARGET_DIR=${2:?$USAGE}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP_BASE_DIR="${TMPDIR:-/tmp}"
TMP_OUTPUT="$(mktemp -d "$TMP_BASE_DIR/einnsyn-codegen.XXXXXX")"
EMITTER_OUTPUT_ROOT="$TMP_OUTPUT/einnsyn-codegen"

cleanup() {
  case "$TMP_OUTPUT" in
    "$TMP_BASE_DIR"/einnsyn-codegen.*)
      [ -d "$TMP_OUTPUT" ] && rm -rf -- "$TMP_OUTPUT"
      ;;
    *)
      echo "Refusing to remove unexpected temp directory: $TMP_OUTPUT" >&2
      ;;
  esac
}

detect_target() {
  if [ -f "$TARGET_DIR/package.json" ] &&
    [ -d "$TARGET_DIR/src" ] &&
    grep -q '"lint:fix"' "$TARGET_DIR/package.json"; then
    TARGET="typescript-sdk"
    return 0
  fi

  if [ -f "$TARGET_DIR/pom.xml" ]; then
    if [ -d "$TARGET_DIR/src/main/java/no/einnsyn/backend" ] ||
      grep -q '<artifactId>backend</artifactId>' "$TARGET_DIR/pom.xml"; then
      TARGET="backend"
      return 0
    fi

    if [ -d "$TARGET_DIR/src/main/java/no/einnsyn/sdk" ] ||
      grep -q '<artifactId>sdk</artifactId>' "$TARGET_DIR/pom.xml"; then
      TARGET="java-sdk"
      return 0
    fi
  fi

  echo "Could not detect target type from '$TARGET_DIR'." >&2
  echo "Expected a backend Maven project, Java SDK Maven project, or TypeScript SDK project." >&2
  exit 1
}

copy_generated_contents() {
  [ -d "$GENERATED_DIR" ] || {
    echo "Expected generated directory '$GENERATED_DIR' was not created." >&2
    exit 1
  }

  mkdir -p "$TARGET_SRC_DIR"
  cp -R "$GENERATED_DIR"/. "$TARGET_SRC_DIR"/
}

validate_target_root() {
  case "$TARGET" in
    backend|java-sdk)
      [ -f "$TARGET_DIR/pom.xml" ] || {
        echo "Expected Maven project root at '$TARGET_DIR' (missing pom.xml)." >&2
        exit 1
      }
      ;;
    typescript-sdk)
      [ -f "$TARGET_DIR/package.json" ] || {
        echo "Expected Node project root at '$TARGET_DIR' (missing package.json)." >&2
        exit 1
      }
      ;;
  esac
}

run_target_postprocess() {
  case "$TARGET" in
    backend|java-sdk)
      (
        cd "$TARGET_DIR"
        mvn spotless:apply
      )
      ;;
    typescript-sdk)
      npm --prefix "$TARGET_DIR" run lint:fix
      ;;
  esac
}

trap cleanup EXIT

detect_target

case "$TARGET" in
  backend)
    GENERATED_DIR="$EMITTER_OUTPUT_ROOT/no/einnsyn/backend"
    TARGET_SRC_DIR="$TARGET_DIR/src/main/java/no/einnsyn/backend"
    COUNT_ROOT="$GENERATED_DIR"
    ;;
  java-sdk)
    GENERATED_DIR="$EMITTER_OUTPUT_ROOT/no/einnsyn/sdk"
    TARGET_SRC_DIR="$TARGET_DIR/src/main/java/no/einnsyn/sdk"
    COUNT_ROOT="$GENERATED_DIR"
    ;;
  typescript-sdk)
    GENERATED_DIR="$EMITTER_OUTPUT_ROOT/sdk-typescript"
    TARGET_SRC_DIR="$TARGET_DIR/src"
    COUNT_ROOT="$GENERATED_DIR"
    ;;
esac

validate_target_root
mkdir -p "$TARGET_SRC_DIR"

find "$TARGET_SRC_DIR" -type f -exec grep -l "// Auto-generated from our API specification" {} + | xargs -r -P 4 rm

npm --prefix "$SCRIPT_DIR" run build
npx tsp compile "$SPEC" --emit "$SCRIPT_DIR" --output-dir "$TMP_OUTPUT"

copy_generated_contents

JAVA_COUNT=$(find "$COUNT_ROOT" -name "*.java" 2>/dev/null | wc -l | tr -d ' ')
CS_COUNT=$(find "$COUNT_ROOT" -name "*.cs" 2>/dev/null | wc -l | tr -d ' ')

[ "$JAVA_COUNT" -gt 0 ] && echo "Generated $JAVA_COUNT Java file(s) into $TARGET_SRC_DIR."
[ "$CS_COUNT" -gt 0 ] && echo "Generated $CS_COUNT C# file(s) into $TARGET_SRC_DIR."

run_target_postprocess
