import { Request } from 'express';
import {
  Controller,
  Post,
  Headers,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { StripeWebhookService } from '../services/stripe-webhook.service';

@ApiTags('Payments Webhook')
@Controller('payments/stripe')
export class StripeWebhookController {
  constructor(private readonly webhookService: StripeWebhookService) {}

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authoritative Stripe Webhook listener with signature verification' })
  @ApiHeader({ name: 'stripe-signature', description: 'Stripe cryptographic signature' })
  @ApiResponse({ status: 200, description: 'Webhook received and processed' })
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: Request & { rawBody?: Buffer },
  ): Promise<{ received: boolean; deduplicated?: boolean }> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    // Retrieve raw body preserved via express verify handler
    const rawBody: Buffer =
      req.rawBody ||
      (Buffer.isBuffer(req.body)
        ? req.body
        : typeof req.body === 'string'
          ? Buffer.from(req.body)
          : Buffer.from(JSON.stringify(req.body || {})));

    return this.webhookService.handleWebhook(rawBody, signature);
  }
}
