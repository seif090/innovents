import {
  PrismaClient,
  Prisma,
  SubscriptionPlan,
  SubscriptionBillingInterval,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting INOVENT baseline database seed...');

  // 1. Seed Roles
  const roles = [
    { name: 'ADMIN', description: 'INOVENT Platform Super Administrator', isSystem: true },
    { name: 'ATTENDEE', description: 'Standard Event Visitor and Community Member', isSystem: true },
    { name: 'SPONSOR', description: 'Commercial Event Sponsor and Exhibitor', isSystem: true },
    { name: 'VENDOR', description: 'Event Service Provider and B2B Contractor', isSystem: true },
    { name: 'PROVIDER', description: 'C2B Service Provider (Hotels, Transport, Offers)', isSystem: true },
    { name: 'EVENT_OWNER', description: 'Event Creator and Management Entity', isSystem: true },
    { name: 'ORGANIZER', description: 'Invited Event Operations Team Member', isSystem: true },
    { name: 'MEDIA', description: 'Accredited Press and Media Representative', isSystem: true },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description, isSystem: role.isSystem },
      create: role,
    });
  }
  console.log(`✅ Seeded ${roles.length} system roles.`);

  // 2. Seed Baseline Permissions
  const permissions = [
    { action: 'manage', resource: 'all', description: 'Full system administrative management' },
    { action: 'create', resource: 'event', description: 'Create events' },
    { action: 'update', resource: 'event', description: 'Update events' },
    { action: 'read', resource: 'event', description: 'View published events' },
    { action: 'register', resource: 'event', description: 'Register as event attendee' },
    { action: 'create', resource: 'community', description: 'Create communities' },
    { action: 'join', resource: 'community', description: 'Join communities' },
    { action: 'create', resource: 'rfq', description: 'Submit B2B RFQs' },
    { action: 'quote', resource: 'rfq', description: 'Submit quotation for RFQ' },
    { action: 'read', resource: 'profile', description: 'Read user profile' },
    { action: 'update', resource: 'profile', description: 'Update user profile' },
    { action: 'read', resource: 'approval', description: 'View business account approvals' },
    { action: 'manage', resource: 'approval', description: 'Approve, reject, suspend business accounts' },
    { action: 'invite', resource: 'organizer', description: 'Invite event organizers' },
    { action: 'manage', resource: 'organizer_invitation', description: 'Manage organizer invitations' },
    { action: 'manage', resource: 'vendor_service', description: 'Manage vendor services' },
    { action: 'manage', resource: 'rfq', description: 'Manage RFQs' },
    { action: 'manage', resource: 'quotation', description: 'Manage Quotations' },
    { action: 'manage', resource: 'c2b_service', description: 'Manage C2B provider services' },
    { action: 'create', resource: 'c2b_booking', description: 'Create C2B booking requests' },
    { action: 'manage', resource: 'c2b_booking', description: 'Manage C2B booking requests' },
    { action: 'manage', resource: 'coupon', description: 'Manage provider coupons' },
    { action: 'redeem', resource: 'coupon', description: 'Redeem provider coupons' },
    { action: 'manage', resource: 'sponsor_ad', description: 'Create and manage sponsor ads' },
    { action: 'review', resource: 'sponsor_ad', description: 'Review and moderate sponsor ads' },
    // Sprint 9: Financial, Subscriptions & Community Sponsorship Permissions
    { action: 'create', resource: 'payment', description: 'Create and initialize payments' },
    { action: 'read_own', resource: 'payment', description: 'Read own payment records' },
    { action: 'manage', resource: 'payment', description: 'Manage all payments and refunds' },
    { action: 'refund', resource: 'payment', description: 'Issue refunds on payments' },
    { action: 'create', resource: 'subscription', description: 'Subscribe to business plans' },
    { action: 'read_own', resource: 'subscription', description: 'Read own subscription records' },
    { action: 'manage', resource: 'subscription', description: 'Manage all business subscriptions' },
    { action: 'create', resource: 'community_sponsorship', description: 'Sponsor a community' },
    { action: 'read', resource: 'community_sponsorship', description: 'View community sponsorships' },
    { action: 'read', resource: 'revenue', description: 'View financial revenue metrics' },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: {
        action_resource: {
          action: perm.action,
          resource: perm.resource,
        },
      },
      update: { description: perm.description },
      create: perm,
    });
  }
  console.log(`✅ Seeded ${permissions.length} core permissions.`);

  // 3. Link ADMIN role with 'manage:all' permission
  const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
  const manageAllPerm = await prisma.permission.findUnique({
    where: { action_resource: { action: 'manage', resource: 'all' } },
  });

  if (adminRole && manageAllPerm) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: manageAllPerm.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: manageAllPerm.id,
      },
    });
  }

  console.log('✅ Linked administrative superuser permissions.');

  // 4. Seed default Community Sponsorship Plan
  await prisma.communitySponsorshipPlan.upsert({
    where: { code: 'DEFAULT' },
    update: {},
    create: {
      code: 'DEFAULT',
      name: 'Standard Community Sponsorship',
      description: '30-day community sponsorship with 500 member capacity and pinned placement',
      price: new Prisma.Decimal(500),
      currency: 'SAR',
      memberCapacity: 500,
      durationDays: 30,
      isActive: true,
    },
  });
  console.log('✅ Seeded default Community Sponsorship Plan.');

  // 5. Seed default Subscription Plans
  const subscriptionPlans = [
    {
      plan: SubscriptionPlan.SPONSOR_MONTHLY,
      name: 'Sponsor Monthly Plan',
      description: 'Monthly platform membership for event sponsors',
      targetRole: 'SPONSOR',
      stripePriceId: process.env.STRIPE_PRICE_SPONSOR_MONTHLY || 'price_sponsor_monthly_mock',
      price: new Prisma.Decimal(1500),
      currency: 'SAR',
      interval: SubscriptionBillingInterval.MONTH,
    },
    {
      plan: SubscriptionPlan.SPONSOR_ANNUAL,
      name: 'Sponsor Annual Plan',
      description: 'Annual platform membership for event sponsors with discount',
      targetRole: 'SPONSOR',
      stripePriceId: process.env.STRIPE_PRICE_SPONSOR_ANNUAL || 'price_sponsor_annual_mock',
      price: new Prisma.Decimal(15000),
      currency: 'SAR',
      interval: SubscriptionBillingInterval.YEAR,
    },
    {
      plan: SubscriptionPlan.VENDOR_MONTHLY,
      name: 'Vendor Monthly Plan',
      description: 'Monthly platform membership for marketplace service vendors',
      targetRole: 'VENDOR',
      stripePriceId: process.env.STRIPE_PRICE_VENDOR_MONTHLY || 'price_vendor_monthly_mock',
      price: new Prisma.Decimal(500),
      currency: 'SAR',
      interval: SubscriptionBillingInterval.MONTH,
    },
    {
      plan: SubscriptionPlan.VENDOR_ANNUAL,
      name: 'Vendor Annual Plan',
      description: 'Annual platform membership for marketplace service vendors with discount',
      targetRole: 'VENDOR',
      stripePriceId: process.env.STRIPE_PRICE_VENDOR_ANNUAL || 'price_vendor_annual_mock',
      price: new Prisma.Decimal(5000),
      currency: 'SAR',
      interval: SubscriptionBillingInterval.YEAR,
    },
  ];

  for (const sp of subscriptionPlans) {
    await prisma.subscriptionPlanConfig.upsert({
      where: { plan: sp.plan },
      update: {
        price: sp.price,
        stripePriceId: sp.stripePriceId,
      },
      create: sp,
    });
  }
  console.log('✅ Seeded default Subscription Plan Configurations.');

  console.log('🏁 INOVENT Baseline Seed Completed Successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Error during database seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
