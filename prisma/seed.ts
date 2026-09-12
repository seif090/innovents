import { PrismaClient } from '@prisma/client';

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
