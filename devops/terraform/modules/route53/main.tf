locals {
  sub_domain = var.STAGE == "prod" ? var.DOMAIN : "${var.STAGE}.${var.DOMAIN}"
}

resource "aws_route53_zone" "dev" {
  count = var.STAGE != "prod" ? 1 : 0
  name  = local.sub_domain
  tags = {
    Environment = var.STAGE
  }
  provider = aws.deployment-us
}

data "aws_route53_zone" "domain_zone_main" {
  name     = var.DOMAIN
  provider = aws.main
}

resource "aws_route53_record" "dev_ns" {
  count    = var.STAGE != "prod" ? 1 : 0
  zone_id  = data.aws_route53_zone.domain_zone_main.zone_id
  name     = local.sub_domain
  type     = "NS"
  ttl      = 30
  records  = aws_route53_zone.dev[count.index].name_servers
  provider = aws.main
}

data "aws_route53_zone" "domain_zone" {
  name       = local.sub_domain
  provider   = aws.route53-account
  depends_on = [aws_route53_record.dev_ns]
}