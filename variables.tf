#=========================================================================================
# GitHub Settings Lambda Vars
#=========================================================================================
variable "app_id" {
  description = "GitHub App ID"
  type        = string
  sensitive   = true
}

variable "private_key" {
  description = "GitHub App Private Key"
  type        = string
  sensitive   = true
}

variable "webhook_secret" {
  description = "GitHub Webhook Secret"
  type        = string
  sensitive   = true
}

variable "github_api_url" {
  description = "GitHub API URL"
  type        = string
  default     = "https://api.github.com"
}