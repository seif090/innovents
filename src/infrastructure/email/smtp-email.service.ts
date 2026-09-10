import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailProvider, SendEmailOptions } from './email.interface';

@Injectable()
export class SmtpEmailService implements EmailProvider {
  private readonly logger = new Logger(SmtpEmailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly defaultFrom: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('email.host', 'localhost');
    const port = this.configService.get<number>('email.port', 1025);
    const user = this.configService.get<string>('email.user', '');
    const pass = this.configService.get<string>('email.password', '');
    this.defaultFrom = this.configService.get<string>(
      'email.from',
      '"INOVENT" <noreply@innovent.app>',
    );

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });
  }

  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    try {
      const from = options.from || this.defaultFrom;
      const to = Array.isArray(options.to) ? options.to.join(', ') : options.to;

      const info = await this.transporter.sendMail({
        from,
        to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
        attachments: options.attachments,
      });

      this.logger.log(`📧 Email dispatched to ${to}. MessageId: ${info.messageId}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${JSON.stringify(options.to)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}
