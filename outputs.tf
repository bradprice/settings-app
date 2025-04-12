output "api_endpoint" {
  value       = "${aws_apigatewayv2_api.github_settings_api.api_endpoint}/"
  description = "The URL to invoke the GitHub Settings"
}