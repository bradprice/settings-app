
#=========================================================================================
# SSM
#=========================================================================================
resource "aws_ssm_parameter" "github_private_key" {
  name        = "/probot/private-key"
  description = "Private key for GitHub Settings App"
  type        = "SecureString"
  value       = file(var.private_key)
}

#=========================================================================================
# Lambdas
#=========================================================================================

resource "aws_iam_role" "github_settings_role" {
  name = "github-settings-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

# Policy 1: AWS-Managed Lambda Execution Policy
resource "aws_iam_role_policy_attachment" "github_settings_lambda_execution" {
  role       = aws_iam_role.github_settings_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Policy 2: Custom SSM Policy
resource "aws_iam_policy" "lambda_ssm_policy" {
  name        = "github-settings-ssm-policy"
  description = "Allow Lambda to read SSM parameter"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = aws_ssm_parameter.github_private_key.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_ssm_policy" {
  role       = aws_iam_role.github_settings_role.name
  policy_arn = aws_iam_policy.lambda_ssm_policy.arn
}

resource "aws_cloudwatch_log_group" "github_settings" {
  name              = "/aws/lambda/github-settings"
  retention_in_days = 1
}

# GitHub Settings Lambda  
resource "aws_lambda_function" "github_settings" {
  function_name    = "github-settings"
  filename         = "dist/github-settings.zip"
  source_code_hash = filebase64sha256("dist/github-settings.zip")
  role             = aws_iam_role.github_settings_role.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  memory_size      = 128
  timeout          = 3

  environment {
    variables = {
      APP_ID            = var.app_id
      PRIVATE_KEY_PARAM = aws_ssm_parameter.github_private_key.name
      WEBHOOK_SECRET    = var.webhook_secret
      GH_API            = var.github_api_url
    }
  }
  depends_on = [
    aws_cloudwatch_log_group.github_settings,
  ]
}

# Lambda Permission to Allow API Gateway Invocation
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.github_settings.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.github_settings_api.execution_arn}/*/*"
}
#=========================================================================================
# API Gateway
#=========================================================================================

# API Gateway HTTP API
resource "aws_apigatewayv2_api" "github_settings_api" {
  name          = "github-settings-api"
  protocol_type = "HTTP"
  description   = "HTTP API GitHub Settings"
}

# Integration: Connect API Gateway to Lambda
resource "aws_apigatewayv2_integration" "lambda_integration" {
  api_id           = aws_apigatewayv2_api.github_settings_api.id
  integration_type = "AWS_PROXY"

  integration_method = "POST" # Required for AWS_PROXY
  integration_uri    = aws_lambda_function.github_settings.invoke_arn
}

# Route: Define API Endpoint (e.g., GET /hello)
resource "aws_apigatewayv2_route" "get_hello" {
  api_id    = aws_apigatewayv2_api.github_settings_api.id
  route_key = "GET /"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_integration.id}"
}

# Stage: Deploy the API
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.github_settings_api.id
  name        = "$default"
  auto_deploy = true
}

