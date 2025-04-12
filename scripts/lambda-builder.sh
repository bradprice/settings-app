#!/usr/bin/env bash

# Exit immediately if a command returns a non-zero status
set -eo pipefail

#=========================================================================================
# Variables
#=========================================================================================
LAMBDA_DIR="${2}"
BUILD_DIR="dist"

mapfile TS_SRC_DIRS < <(find src/ -maxdepth 2 -name \*ts -printf "%h\0" | sort -zu | tr '\0' '\n')
mapfile JS_SRC_DIRS < <(find src/ -maxdepth 2 -name \*js -not -name jest.config.js -printf "%h\0" | sort -zu | tr '\0' '\n')
mapfile PY_SRC_DIRS < <(find src/ -maxdepth 2 -name \*py -printf "%h\0" | sort -zu | tr '\0' '\n')

#=========================================================================================
# Functions
#=========================================================================================
function usage() {
    echo -e "Usage: $(basename "${0}") [ -t src/typescript-lambda ] [ -n src/node-lambda ] [ -p src/python-lambda ]"
    echo -e "Example: $(basename "${0}") [ -t src/lambda-name ]"
    echo -e "\t-t TypeScript"
    echo -e "\t-n Node.js"
    echo -e "\t-p Python"
    exit 1
}

function parseOptions() {
  while getopts ":t:n:p:h" OPTIONS; do
    case ${OPTIONS} in
      t) LAMBDA_TYPE="typescript" ;;
      n) LAMBDA_TYPE="node" ;;
      p) LAMBDA_TYPE="python" ;;
      h) usage ;;
      *) usage ;;
    esac
  done
}

function buildTypescriptLambda() {
  # Install dependencies
  echo -e "Installing: [${FUNCTION_NAME}]"
  npm install --silent --prefix "${SRC_DIR}"

  # Transpile TypeScript Code
  pushd "${SRC_DIR}" > /dev/null 2>&1 || exit 1
    echo -e "Transpiling: [${FUNCTION_NAME}]"
    npx tsc --build
    cp package.json dist/package.json
    npm install --no-optional --silent --omit=dev --package-lock=false --prefix ./dist

    # Set proper permissions: directories 755 and files 644
    chmod -R u+rwX,go+rX,go-w "./dist/"
  popd > /dev/null 2>&1 || exit 2

  # Package Lambda
  pushd "${SRC_DIR}/dist" > /dev/null 2>&1 || exit 1
    echo -e "Packaging: [${FUNCTION_NAME}]"
    chmod -R 777 ./
    zip -rq "../../../${BUILD_DIR}/${FUNCTION_NAME}".zip .
  popd > /dev/null 2>&1 || exit 2
  echo -e ""
}

function buildNodeLambda() {
  # Install dependencies
  echo -e "Installing: [${FUNCTION_NAME}]"

  mkdir -p "${SRC_DIR}/dist/"
  find "${SRC_DIR}" -maxdepth 1 \( -name \*.js -o -name \*.json \) -not -name \*.test.js -exec cp {} "${SRC_DIR}/dist/" \;

  pushd "${SRC_DIR}" > /dev/null 2>&1 || exit 1
    # Don't fail if there is no package.json
    npm install --silent --prefix ./dist || true

    # Set proper permissions: directories 755 and files 644
    chmod -R u+rwX,go+rX,go-w "./dist/" || true
  popd > /dev/null 2>&1 || exit 2

  # Package Lambda
  pushd "${SRC_DIR}/dist" > /dev/null 2>&1 || exit 1
    echo -e "Packaging: [${FUNCTION_NAME}]"
    zip -rq "../../../${BUILD_DIR}/${FUNCTION_NAME}".zip .
  popd > /dev/null 2>&1 || exit 2
  echo -e ""
}

function buildPythonLambda() {
  # Install dependencies
  echo -e "Installing: [${FUNCTION_NAME}]"
  if [[ -f ${SRC_DIR}/requirements.txt ]]; then
    pip3.11 install --quiet --quiet --requirement "${SRC_DIR}/requirements.txt" --target "${SRC_DIR}/dist" || true
  else
    mkdir -p "${SRC_DIR}/dist/"
  fi
  find "${SRC_DIR}" -maxdepth 1 \( -name \*.py -o -name \*.txt \) -exec cp {} "${SRC_DIR}/dist/" \;

  # Set proper permissions: directories 755 and files 644
  chmod -R u+rwX,go+rX,go-w "${SRC_DIR}/dist/"

  # Package Lambda
  pushd "${SRC_DIR}/dist" > /dev/null 2>&1 || exit 1
    echo -e "Packaging: [${FUNCTION_NAME}]"
    zip -rq "../../../${BUILD_DIR}/${FUNCTION_NAME}".zip .
  popd > /dev/null 2>&1 || exit 2
  echo -e ""
}

function buildLambda() {
  local TYPE="${1}"; shift
  local LAMBDA_SRC_DIRS=("${@}")

  case ${TYPE} in
    typescript) TYPE="TypeScript"; buildFunction="buildTypescriptLambda" ;;
    node) TYPE="Node.js"; buildFunction="buildNodeLambda" ;;
    python) TYPE="Python"; buildFunction="buildPythonLambda";;
    *) echo "You Did Something Wrong!"; exit 1 ;;
  esac

  if [[ ${#LAMBDA_SRC_DIRS[@]} -gt 0 ]]; then
    echo -e "#==============================================================================="
    echo -e "# Building ${#LAMBDA_SRC_DIRS[@]} ${TYPE} Lambda(s)"
    echo -e "#==============================================================================="
    for LAMBDA_SRC_DIR in "${LAMBDA_SRC_DIRS[@]}";
    do
      # Strip unwanted whitespace
      SRC_DIR=$(echo "${LAMBDA_SRC_DIR}" | awk '{$1=$1};1')
      FUNCTION_NAME=$(basename "${SRC_DIR}")
      ${buildFunction}
    done
  fi
}

function main() {
  parseOptions "${@}"
  if [[ ! -d ${BUILD_DIR} ]]; then
    mkdir -p "${BUILD_DIR}"
  fi

  if [[ -z ${LAMBDA_DIR} ]]; then
    buildLambda "typescript" "${TS_SRC_DIRS[@]}"
    buildLambda "node" "${JS_SRC_DIRS[@]}"
    buildLambda "python" "${PY_SRC_DIRS[@]}"
  else
    if [[ -d ${LAMBDA_DIR} ]]; then
      # Strip unwanted whitespace
      SRC_DIR=$(echo "${LAMBDA_DIR}" | awk '{$1=$1};1')
      FUNCTION_NAME=$(basename "${SRC_DIR}")
      buildLambda "${LAMBDA_TYPE}" "${SRC_DIR}"
    else
      echo -e "FATAL: ${LAMBDA_DIR} does NOT exist"
      exit 3
    fi
  fi

  echo "Done!"
}

##########################################################################################
main "${@}"


