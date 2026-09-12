import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface EmailTemplateContext {
  recipientName?: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  language?: string; // 'en' | 'ar'
}

@Injectable()
export class EmailTemplateService {
  /**
   * Renders a localized email template with subject, HTML body, and plain text fallback
   */
  render(type: NotificationType, context: EmailTemplateContext): RenderedEmail {
    const lang = context.language === 'ar' ? 'ar' : 'en';
    const recipientName =
      context.recipientName || (lang === 'ar' ? 'عزيزي المستخدم' : 'Valued User');

    switch (type) {
      case NotificationType.SESSION_REMINDER:
        return this.renderSessionReminder(context, lang, recipientName);
      case NotificationType.EVENT_CANCELLED:
        return this.renderEventCancelled(context, lang, recipientName);
      case NotificationType.COMMUNITY_POST_MENTION:
        return this.renderCommunityMention(context, lang, recipientName);
      case NotificationType.COMMUNITY_POST_REPLY:
        return this.renderCommunityReply(context, lang, recipientName);
      case NotificationType.COMMUNITY_MEETUP_CREATED:
        return this.renderMeetupCreated(context, lang, recipientName);
      case NotificationType.COMMUNITY_MEETUP_REMINDER:
        return this.renderMeetupReminder(context, lang, recipientName);
      case NotificationType.COMMUNITY_MODERATION_ACTION:
        return this.renderModerationAction(context, lang, recipientName);
      case NotificationType.SECURITY_PASSWORD_RESET:
        return this.renderSecurityPasswordReset(context, lang, recipientName);
      case NotificationType.ACCOUNT_APPROVED:
        return this.renderAccountApproved(context, lang, recipientName);
      case NotificationType.ACCOUNT_REJECTED:
        return this.renderAccountRejected(context, lang, recipientName);
      case NotificationType.ACCOUNT_SUSPENDED:
        return this.renderAccountSuspended(context, lang, recipientName);
      case NotificationType.ORGANIZER_INVITATION_CREATED:
        return this.renderOrganizerInvitation(context, lang, recipientName);
      case NotificationType.ORGANIZER_INVITATION_ACCEPTED:
        return this.renderOrganizerInvitationAccepted(context, lang, recipientName);
      default:
        return this.renderDefaultNotification(context, lang, recipientName);
    }
  }

  private renderSessionReminder(
    ctx: EmailTemplateContext,
    lang: 'en' | 'ar',
    recipientName: string,
  ): RenderedEmail {
    const sessionTitle = (ctx.data?.sessionTitle as string) || ctx.title || 'Upcoming Session';
    const startsAt = (ctx.data?.startsAt as string) || '';

    if (lang === 'ar') {
      const subject = `تذكير: جلستك القادمة تبدأ قريباً — ${sessionTitle}`;
      const text = `مرحباً ${recipientName}،\n\nنود تذكيرك بأن الجلسة "${sessionTitle}" ستبدأ قريباً في ${startsAt}.\n\nنتمنى لك وقتاً مفيداً!\nفريق إينوفنت`;
      const html = this.wrapHtml(
        `<h2>تذكير ببدء الجلسة</h2>
         <p>مرحباً <strong>${recipientName}</strong>،</p>
         <p>نود تذكيرك بأن الجلسة <strong>"${sessionTitle}"</strong> ستبدأ خلال 15 دقيقة.</p>
         <p><strong>الوقت:</strong> ${startsAt}</p>
         <p>يرجى التواجد في القاعة المحددة.</p>`,
        'ar',
      );
      return { subject, html, text };
    }

    const subject = `Reminder: Your session starts soon — ${sessionTitle}`;
    const text = `Hello ${recipientName},\n\nThis is a reminder that "${sessionTitle}" will begin in 15 minutes (${startsAt}).\n\nBest regards,\nThe INOVENT Team`;
    const html = this.wrapHtml(
      `<h2>Session Starting Soon</h2>
       <p>Hello <strong>${recipientName}</strong>,</p>
       <p>This is a reminder that your scheduled session <strong>"${sessionTitle}"</strong> is starting in 15 minutes.</p>
       <p><strong>Scheduled Time:</strong> ${startsAt}</p>
       <p>Please make your way to the designated venue.</p>`,
      'en',
    );
    return { subject, html, text };
  }

  private renderEventCancelled(
    ctx: EmailTemplateContext,
    lang: 'en' | 'ar',
    recipientName: string,
  ): RenderedEmail {
    const eventName = (ctx.data?.eventName as string) || ctx.title || 'Event';
    if (lang === 'ar') {
      const subject = `إشعار مهم: تم إلغاء الفعالية — ${eventName}`;
      const text = `مرحباً ${recipientName}،\n\nنأسف لإبلاغك بأنه قد تم إلغاء الفعالية "${eventName}".\n\nفريق إينوفنت`;
      const html = this.wrapHtml(
        `<h2>إشعار إلغاء الفعالية</h2>
         <p>مرحباً <strong>${recipientName}</strong>،</p>
         <p>نأسف لإبلاغك بأن الفعالية <strong>"${eventName}"</strong> قد تم إلغاؤها من قبل المنظمين.</p>`,
        'ar',
      );
      return { subject, html, text };
    }

    const subject = `Important Notice: Event Cancelled — ${eventName}`;
    const text = `Hello ${recipientName},\n\nWe regret to inform you that "${eventName}" has been cancelled.\n\nBest regards,\nThe INOVENT Team`;
    const html = this.wrapHtml(
      `<h2>Event Cancellation Notice</h2>
       <p>Hello <strong>${recipientName}</strong>,</p>
       <p>We regret to inform you that the event <strong>"${eventName}"</strong> has been cancelled by the organizers.</p>`,
      'en',
    );
    return { subject, html, text };
  }

  private renderCommunityMention(
    ctx: EmailTemplateContext,
    lang: 'en' | 'ar',
    recipientName: string,
  ): RenderedEmail {
    const actorName = (ctx.data?.actorName as string) || 'Someone';
    if (lang === 'ar') {
      const subject = `قام ${actorName} بالإشارة إليك في المجتمع`;
      const text = `مرحباً ${recipientName}، قام ${actorName} بالإشارة إليك في منشور بالمجتمع.\n\n${ctx.body || ''}`;
      const html = this.wrapHtml(
        `<h2>إشارة جديدة</h2>
         <p>مرحباً <strong>${recipientName}</strong>،</p>
         <p>قام <strong>${actorName}</strong> بالإشارة إليك:</p>
         <blockquote>${ctx.body || ''}</blockquote>`,
        'ar',
      );
      return { subject, html, text };
    }

    const subject = `${actorName} mentioned you in a community`;
    const text = `Hello ${recipientName},\n\n${actorName} mentioned you in a community post:\n\n${ctx.body || ''}`;
    const html = this.wrapHtml(
      `<h2>New Mention</h2>
       <p>Hello <strong>${recipientName}</strong>,</p>
       <p><strong>${actorName}</strong> mentioned you in a community:</p>
       <blockquote>${ctx.body || ''}</blockquote>`,
      'en',
    );
    return { subject, html, text };
  }

  private renderCommunityReply(
    ctx: EmailTemplateContext,
    lang: 'en' | 'ar',
    recipientName: string,
  ): RenderedEmail {
    const replierName = (ctx.data?.replierName as string) || 'Someone';
    if (lang === 'ar') {
      const subject = `رد جديد من ${replierName} على منشورك`;
      const text = `مرحباً ${recipientName}، قام ${replierName} بالرد على منشورك:\n\n${ctx.body || ''}`;
      const html = this.wrapHtml(
        `<h2>رد جديد على منشورك</h2>
         <p>مرحباً <strong>${recipientName}</strong>،</p>
         <p>قام <strong>${replierName}</strong> بالرد على منشورك:</p>
         <blockquote>${ctx.body || ''}</blockquote>`,
        'ar',
      );
      return { subject, html, text };
    }

    const subject = `New reply from ${replierName} on your post`;
    const text = `Hello ${recipientName},\n\n${replierName} replied to your post:\n\n${ctx.body || ''}`;
    const html = this.wrapHtml(
      `<h2>New Reply</h2>
       <p>Hello <strong>${recipientName}</strong>,</p>
       <p><strong>${replierName}</strong> replied to your post:</p>
       <blockquote>${ctx.body || ''}</blockquote>`,
      'en',
    );
    return { subject, html, text };
  }

  private renderMeetupCreated(
    ctx: EmailTemplateContext,
    lang: 'en' | 'ar',
    recipientName: string,
  ): RenderedEmail {
    const meetupTitle = (ctx.data?.meetupTitle as string) || ctx.title || 'New Meetup';
    if (lang === 'ar') {
      const subject = `لقاء مجتمعي جديد: ${meetupTitle}`;
      const text = `مرحباً ${recipientName}، تم إنشاء لقاء جديد "${meetupTitle}".`;
      const html = this.wrapHtml(
        `<h2>لقاء مجتمعي جديد</h2>
         <p>مرحباً <strong>${recipientName}</strong>،</p>
         <p>تم الإعلان عن لقاء مجتمعي جديد: <strong>${meetupTitle}</strong>.</p>`,
        'ar',
      );
      return { subject, html, text };
    }

    const subject = `New Community Meetup: ${meetupTitle}`;
    const text = `Hello ${recipientName},\n\nA new community meetup "${meetupTitle}" has been scheduled.`;
    const html = this.wrapHtml(
      `<h2>New Community Meetup</h2>
       <p>Hello <strong>${recipientName}</strong>,</p>
       <p>A new community meetup <strong>"${meetupTitle}"</strong> has been scheduled.</p>`,
      'en',
    );
    return { subject, html, text };
  }

  private renderMeetupReminder(
    ctx: EmailTemplateContext,
    lang: 'en' | 'ar',
    recipientName: string,
  ): RenderedEmail {
    const meetupTitle = (ctx.data?.meetupTitle as string) || ctx.title || 'Meetup';
    if (lang === 'ar') {
      const subject = `تذكير: لقاء "${meetupTitle}" يبدأ قريباً`;
      const text = `مرحباً ${recipientName}، نود تذكيرك بأن اللقاء المجتمعي "${meetupTitle}" سيبدأ خلال 15 دقيقة.`;
      const html = this.wrapHtml(
        `<h2>تذكير باللقاء المجتمعي</h2>
         <p>مرحباً <strong>${recipientName}</strong>،</p>
         <p>لقاؤك المجتمعي <strong>"${meetupTitle}"</strong> سيبدأ خلال 15 دقيقة.</p>`,
        'ar',
      );
      return { subject, html, text };
    }

    const subject = `Reminder: Meetup "${meetupTitle}" starts soon`;
    const text = `Hello ${recipientName},\n\nThis is a reminder that the meetup "${meetupTitle}" will begin in 15 minutes.`;
    const html = this.wrapHtml(
      `<h2>Meetup Starting Soon</h2>
       <p>Hello <strong>${recipientName}</strong>,</p>
       <p>Your community meetup <strong>"${meetupTitle}"</strong> is starting in 15 minutes.</p>`,
      'en',
    );
    return { subject, html, text };
  }

  private renderModerationAction(
    ctx: EmailTemplateContext,
    lang: 'en' | 'ar',
    recipientName: string,
  ): RenderedEmail {
    if (lang === 'ar') {
      const subject = `إشعار إشراف في المجتمع`;
      const text = `مرحباً ${recipientName}، تم اتخاذ إجراء إشرافي بخصوص حسابك أو منشورك:\n\n${ctx.body || ''}`;
      const html = this.wrapHtml(
        `<h2>إشعار إشراف</h2>
         <p>مرحباً <strong>${recipientName}</strong>،</p>
         <p>${ctx.body || 'تم اتخاذ إجراء إشرافي بخصوص نشاطك في المجتمع.'}</p>`,
        'ar',
      );
      return { subject, html, text };
    }

    const subject = `Community Moderation Notice`;
    const text = `Hello ${recipientName},\n\nA moderation action was taken regarding your activity:\n\n${ctx.body || ''}`;
    const html = this.wrapHtml(
      `<h2>Moderation Notice</h2>
       <p>Hello <strong>${recipientName}</strong>,</p>
       <p>${ctx.body || 'A moderation action has been taken regarding your community activity.'}</p>`,
      'en',
    );
    return { subject, html, text };
  }

  private renderSecurityPasswordReset(
    _ctx: EmailTemplateContext,
    lang: 'en' | 'ar',
    recipientName: string,
  ): RenderedEmail {
    if (lang === 'ar') {
      const subject = `تنبيه أمني: تم تغيير كلمة المرور بنجاح`;
      const text = `مرحباً ${recipientName}، تم تغيير كلمة المرور لحسابك في إينوفنت. إذا لم تكن أنت من قام بهذا، يرجى التواصل معنا فوراً.`;
      const html = this.wrapHtml(
        `<h2>تنبيه أمني</h2>
         <p>مرحباً <strong>${recipientName}</strong>،</p>
         <p>تم تغيير كلمة المرور لحسابك بنجاح. إذا لم تكن أنت من قام بهذا الإجراء، يرجى إعادة تعيين كلمة المرور فوراً والتواصل مع الدعم الفني.</p>`,
        'ar',
      );
      return { subject, html, text };
    }

    const subject = `Security Alert: Your Password Was Changed`;
    const text = `Hello ${recipientName},\n\nYour INOVENT account password was recently changed. If you did not make this change, please contact support immediately.`;
    const html = this.wrapHtml(
      `<h2>Security Alert</h2>
       <p>Hello <strong>${recipientName}</strong>,</p>
       <p>Your INOVENT account password was recently changed. If you did not initiate this request, please reset your password immediately and contact support.</p>`,
      'en',
    );
    return { subject, html, text };
  }

  private renderAccountApproved(
    _ctx: EmailTemplateContext,
    lang: 'en' | 'ar',
    recipientName: string,
  ): RenderedEmail {
    if (lang === 'ar') {
      const subject = `تهانينا! تمت الموافقة على حسابك في إينوفنت`;
      const text = `مرحباً ${recipientName}، تمت مراجعة حسابك والموافقة عليه بنجاح. يمكنك الآن تسجيل الدخول والاستفادة من جميع الميزات.`;
      const html = this.wrapHtml(
        `<h2>تم تفعيل الحساب</h2>
         <p>مرحباً <strong>${recipientName}</strong>،</p>
         <p>يسعدنا إبلاغك بأنه تمت الموافقة على حسابك بنجاح. يمكنك الآن تسجيل الدخول إلى منصة إينوفنت.</p>`,
        'ar',
      );
      return { subject, html, text };
    }

    const subject = `Welcome to INOVENT! Your Account Has Been Approved`;
    const text = `Hello ${recipientName},\n\nYour INOVENT account has been approved by our team. You can now log in and access all platform features.`;
    const html = this.wrapHtml(
      `<h2>Account Approved</h2>
       <p>Hello <strong>${recipientName}</strong>,</p>
       <p>We are delighted to inform you that your INOVENT account has been reviewed and approved. You can now log in and access full platform capabilities.</p>`,
      'en',
    );
    return { subject, html, text };
  }

  private renderAccountRejected(
    ctx: EmailTemplateContext,
    lang: 'en' | 'ar',
    recipientName: string,
  ): RenderedEmail {
    if (lang === 'ar') {
      const subject = `إشعار بخصوص طلب الانضمام إلى إينوفنت`;
      const text = `مرحباً ${recipientName}، نأسف لإبلاغك بأنه لم تتم الموافقة على حسابك للأسباب التالية: ${ctx.body || 'عدم استيفاء الشروط'}.`;
      const html = this.wrapHtml(
        `<h2>إشعار مراجعة الحساب</h2>
         <p>مرحباً <strong>${recipientName}</strong>،</p>
         <p>نأسف لإبلاغك بأنه لم يتم قبول طلبك في الوقت الحالي. التفاصيل: ${ctx.body || 'عدم استيفاء الشروط المطلوبة'}.</p>`,
        'ar',
      );
      return { subject, html, text };
    }

    const subject = `INOVENT Account Application Status`;
    const text = `Hello ${recipientName},\n\nWe regret to inform you that your application could not be approved at this time. Details: ${ctx.body || 'Requirements not met'}.`;
    const html = this.wrapHtml(
      `<h2>Account Review Update</h2>
       <p>Hello <strong>${recipientName}</strong>,</p>
       <p>We regret to inform you that your application was not approved at this time. Details: ${ctx.body || 'Requirements not met'}.</p>`,
      'en',
    );
    return { subject, html, text };
  }

  private renderAccountSuspended(
    _ctx: EmailTemplateContext,
    lang: 'en' | 'ar',
    recipientName: string,
  ): RenderedEmail {
    if (lang === 'ar') {
      const subject = `تنبيه أمني: تم إيقاف حسابك في إينوفنت`;
      const text = `مرحباً ${recipientName}، تم إيقاف حسابك مؤقتاً بسبب مخالفة سياسات الاستخدام.\n\nفريق إينوفنت`;
      const html = this.wrapHtml(
        `<h2>إشعار إيقاف الحساب</h2>
         <p>مرحباً <strong>${recipientName}</strong>،</p>
         <p>تم إيقاف حسابك في منصة إينوفنت لمخالفة سياسات الاستخدام أو متطلبات الأمان.</p>`,
        'ar',
      );
      return { subject, html, text };
    }

    const subject = `Security Notice: Your INOVENT Account Has Been Suspended`;
    const text = `Hello ${recipientName},\n\nYour INOVENT account has been suspended due to security or policy compliance reasons.`;
    const html = this.wrapHtml(
      `<h2>Account Suspension Notice</h2>
       <p>Hello <strong>${recipientName}</strong>,</p>
       <p>Your INOVENT account has been suspended due to security or platform policy violations.</p>`,
      'en',
    );
    return { subject, html, text };
  }

  private renderOrganizerInvitation(
    ctx: EmailTemplateContext,
    lang: 'en' | 'ar',
    recipientName: string,
  ): RenderedEmail {
    const eventName = (ctx.data?.eventName as string) || ctx.title || 'INOVENT Event';
    const inviterName = (ctx.data?.inviterName as string) || 'Event Owner';
    const invitationLink = (ctx.data?.invitationLink as string) || '#';
    const expiresAt = (ctx.data?.expiresAt as string) || '';

    if (lang === 'ar') {
      const subject = `دعوة للانضمام كمنظم للفعالية — ${eventName}`;
      const text = `مرحباً ${recipientName}،\n\nتمت دعوتك من قِبل ${inviterName} للانضمام كمنظم للفعالية "${eventName}".\n\nرابط قبول الدعوة: ${invitationLink}\nتنتهي صلاحية هذه الدعوة في: ${expiresAt}\n\nفريق إينوفنت`;
      const html = this.wrapHtml(
        `<h2>دعوة لتنظيم الفعالية</h2>
         <p>مرحباً <strong>${recipientName}</strong>،</p>
         <p>يسرنا إبلاغك بأن <strong>${inviterName}</strong> قد دعاك للانضمام إلى فريق تنظيم الفعالية <strong>"${eventName}"</strong>.</p>
         <p><strong>تاريخ انتهاء الدعوة:</strong> ${expiresAt}</p>
         <p><a href="${invitationLink}" style="display:inline-block;padding:10px 20px;background:#0052cc;color:#ffffff;text-decoration:none;border-radius:4px;">قبول الدعوة</a></p>
         <p style="font-size:12px;color:#6b778c;">إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذا البريد بأمان.</p>`,
        'ar',
      );
      return { subject, html, text };
    }

    const subject = `Invitation to organize event: ${eventName}`;
    const text = `Hello ${recipientName},\n\nYou have been invited by ${inviterName} to join the organizing team for "${eventName}".\n\nAccept invitation: ${invitationLink}\nThis invitation expires at: ${expiresAt}\n\nBest regards,\nThe INOVENT Team`;
    const html = this.wrapHtml(
      `<h2>Event Organizer Invitation</h2>
       <p>Hello <strong>${recipientName}</strong>,</p>
       <p>You have been invited by <strong>${inviterName}</strong> to join the organizing team for <strong>"${eventName}"</strong>.</p>
       <p><strong>Expires:</strong> ${expiresAt}</p>
       <p><a href="${invitationLink}" style="display:inline-block;padding:10px 20px;background:#0052cc;color:#ffffff;text-decoration:none;border-radius:4px;">Accept Invitation</a></p>
       <p style="font-size:12px;color:#6b778c;">If you were not expecting this invitation, you can safely ignore this email.</p>`,
      'en',
    );
    return { subject, html, text };
  }

  private renderOrganizerInvitationAccepted(
    ctx: EmailTemplateContext,
    lang: 'en' | 'ar',
    recipientName: string,
  ): RenderedEmail {
    const eventName = (ctx.data?.eventName as string) || ctx.title || 'INOVENT Event';
    const organizerEmail = (ctx.data?.organizerEmail as string) || '';

    if (lang === 'ar') {
      const subject = `تم قبول دعوة التنظيم للفعالية — ${eventName}`;
      const text = `مرحباً ${recipientName}،\n\nقام ${organizerEmail} بقبول دعوتك للانضمام كمنظم للفعالية "${eventName}".`;
      const html = this.wrapHtml(
        `<h2>تم قبول دعوة التنظيم</h2>
         <p>مرحباً <strong>${recipientName}</strong>،</p>
         <p>قام <strong>${organizerEmail}</strong> بقبول دعوتك للانضمام إلى فريق تنظيم الفعالية <strong>"${eventName}"</strong> بنجاح.</p>`,
        'ar',
      );
      return { subject, html, text };
    }

    const subject = `Organizer invitation accepted for ${eventName}`;
    const text = `Hello ${recipientName},\n\n${organizerEmail} has accepted your invitation to join the organizing team for "${eventName}".`;
    const html = this.wrapHtml(
      `<h2>Organizer Invitation Accepted</h2>
       <p>Hello <strong>${recipientName}</strong>,</p>
       <p><strong>${organizerEmail}</strong> has accepted your invitation to join the organizing team for <strong>"${eventName}"</strong>.</p>`,
      'en',
    );
    return { subject, html, text };
  }

  private renderDefaultNotification(
    ctx: EmailTemplateContext,
    lang: 'en' | 'ar',
    recipientName: string,
  ): RenderedEmail {
    const title = ctx.title || (lang === 'ar' ? 'إشعار جديد' : 'New Notification');
    const body = ctx.body || '';

    if (lang === 'ar') {
      return {
        subject: `إينوفنت — ${title}`,
        text: `مرحباً ${recipientName}،\n\n${body}\n\nفريق إينوفنت`,
        html: this.wrapHtml(
          `<h2>${title}</h2>
           <p>مرحباً <strong>${recipientName}</strong>،</p>
           <p>${body}</p>`,
          'ar',
        ),
      };
    }

    return {
      subject: `INOVENT — ${title}`,
      text: `Hello ${recipientName},\n\n${body}\n\nBest regards,\nThe INOVENT Team`,
      html: this.wrapHtml(
        `<h2>${title}</h2>
         <p>Hello <strong>${recipientName}</strong>,</p>
         <p>${body}</p>`,
        'en',
      ),
    };
  }

  private wrapHtml(content: string, dir: 'en' | 'ar'): string {
    const direction = dir === 'ar' ? 'rtl' : 'ltr';
    const align = dir === 'ar' ? 'right' : 'left';
    return `<!DOCTYPE html>
<html lang="${dir}" dir="${direction}">
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f4f5f7; color: #172b4d; margin: 0; padding: 24px; direction: ${direction}; text-align: ${align}; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 4px rgba(0,0,0,0.08); }
    h2 { color: #0052cc; margin-top: 0; }
    blockquote { border-${align}: 4px solid #0052cc; margin: 16px 0; padding: 8px 16px; background: #f8f9fa; font-style: italic; }
    .footer { margin-top: 24px; font-size: 12px; color: #6b778c; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    ${content}
    <div class="footer">
      <p>© 2026 INOVENT Smart Event Ecosystem. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
  }
}
