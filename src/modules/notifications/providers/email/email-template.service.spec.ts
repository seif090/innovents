import { Test, TestingModule } from '@nestjs/testing';
import { EmailTemplateService } from './email-template.service';
import { NotificationType } from '@prisma/client';

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailTemplateService],
    }).compile();

    service = module.get<EmailTemplateService>(EmailTemplateService);
  });

  it('should render session reminder in English and Arabic', () => {
    const en = service.render(NotificationType.SESSION_REMINDER, {
      title: 'Keynote Speech',
      recipientName: 'Sarah',
      data: { sessionTitle: 'Keynote Speech', startsAt: '10:00 AM' },
      language: 'en',
    });

    expect(en.subject).toContain('Keynote Speech');
    expect(en.html).toContain('Sarah');
    expect(en.text).toContain('Keynote Speech');

    const ar = service.render(NotificationType.SESSION_REMINDER, {
      title: 'الكلمة الافتتاحية',
      recipientName: 'سارة',
      data: { sessionTitle: 'الكلمة الافتتاحية', startsAt: '10:00 ص' },
      language: 'ar',
    });

    expect(ar.subject).toContain('الكلمة الافتتاحية');
    expect(ar.html).toContain('سارة');
    expect(ar.html).toContain('dir="rtl"');
  });

  it('should render event cancellation in English and Arabic', () => {
    const en = service.render(NotificationType.EVENT_CANCELLED, {
      title: 'Tech Summit 2026',
      data: { eventName: 'Tech Summit 2026' },
      language: 'en',
    });

    expect(en.subject).toContain('Event Cancelled');
    expect(en.html).toContain('Tech Summit 2026');

    const ar = service.render(NotificationType.EVENT_CANCELLED, {
      title: 'قمة التقنية 2026',
      data: { eventName: 'قمة التقنية 2026' },
      language: 'ar',
    });

    expect(ar.subject).toContain('تم إلغاء الفعالية');
    expect(ar.html).toContain('قمة التقنية 2026');
  });

  it('should render community mention with quote in HTML', () => {
    const en = service.render(NotificationType.COMMUNITY_POST_MENTION, {
      body: 'Check out @sarah in this session!',
      data: { actorName: 'Ahmed' },
      language: 'en',
    });

    expect(en.subject).toContain('Ahmed mentioned you');
    expect(en.html).toContain('<blockquote>Check out @sarah in this session!</blockquote>');
  });

  it('should render RFQ sent notification in English and Arabic', () => {
    const en = service.render(NotificationType.RFQ_SENT, {
      title: 'AV Staging',
      recipientName: 'Apex Vendor',
      data: { title: 'AV Staging', expiresAt: '2026-10-01T00:00:00Z' },
      language: 'en',
    });

    expect(en.subject).toContain('New Request for Quotation: AV Staging');
    expect(en.html).toContain('dir="ltr"');
    expect(en.text).toContain('AV Staging');

    const ar = service.render(NotificationType.RFQ_SENT, {
      title: 'تجهيزات المسرح',
      recipientName: 'المورد المعتمد',
      data: { title: 'تجهيزات المسرح', expiresAt: '2026-10-01' },
      language: 'ar',
    });

    expect(ar.subject).toContain('طلب عرض أسعار جديد: تجهيزات المسرح');
    expect(ar.html).toContain('dir="rtl"');
    expect(ar.text).toContain('تجهيزات المسرح');
  });

  it('should render RFQ accepted notification in English and Arabic', () => {
    const en = service.render(NotificationType.RFQ_ACCEPTED, {
      recipientName: 'Apex Vendor',
      data: { total: 15000, currency: 'SAR' },
      language: 'en',
    });

    expect(en.subject).toContain('Congratulations! Your Quotation Has Been Accepted');
    expect(en.html).toContain('15000 SAR');

    const ar = service.render(NotificationType.RFQ_ACCEPTED, {
      recipientName: 'المورد المعتمد',
      data: { total: 15000, currency: 'SAR' },
      language: 'ar',
    });

    expect(ar.subject).toContain('تهانينا! تم قبول عرض الأسعار الخاص بك');
    expect(ar.html).toContain('15000 SAR');
  });

  it('should render default notification fallback gracefully', () => {
    const en = service.render(NotificationType.EVENT_PUBLISHED, {
      title: 'New Conference',
      body: 'Join the conference today',
      language: 'en',
    });

    expect(en.subject).toContain('New Conference');
    expect(en.text).toContain('Join the conference today');
  });
});
