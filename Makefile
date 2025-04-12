#=========================================================================================
# Settings App
#=========================================================================================

SRC_DIR = $(shell find src/ -maxdepth 2 -name \*ts -printf "%h\n" | uniq)

##########################################################################################

.PHONY: usage build clean help

usage:
	@echo -e
	@echo -e " USAGE:"
	@echo -e "\tmake <target> where <target> is one of the following:"
	@echo -e
	@echo -e " TARGETS:"
	@echo -e
	@echo -e " tflint\tLint Terraform code"
	@echo -e " build\tBuild Lambda(s)"
	@echo -e " clean\tClean workspace"
	@echo -e

tflint:
	@terraform fmt
	@terraform validate
	@tflint

lint: tflint

install:
	$(foreach VAR,$(SRC_DIR),npm install --prefix $(VAR);)

build:
	@scripts/lambda-builder.sh

plan: tflint
	@terraform plan

apply:
	@terraform apply

deploy: build plan
	@terraform apply -auto-approve

clean:
	@rm -rf dist/
	@find . -type d \( -name "dist" -o -name "node_modules" \) -print0 | xargs -0 rm -rf -

help: usage
