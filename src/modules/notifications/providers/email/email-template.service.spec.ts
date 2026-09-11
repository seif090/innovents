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
