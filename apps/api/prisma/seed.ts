import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  DEFAULT_USD_TO_KHR_RATE,
  PERMISSION_DEFINITIONS,
} from '@cambodia-pos/shared';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Cambodia POS SaaS permissions...');

  for (const perm of PERMISSION_DEFINITIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {
        module: perm.module,
        description: perm.description,
      },
      create: {
        code: perm.code,
        module: perm.module,
        description: perm.description,
      },
    });
  }

  const demoEmail = 'owner@bayv.com.kh';
  const existingUser = await prisma.user.findUnique({ where: { email: demoEmail } });

  if (!existingUser) {
    console.log('Seeding demo tenant: BayV Accessories...');
    const passwordHash = await bcrypt.hash('Demo1234!', 10);
    const allPermissions = await prisma.permission.findMany();

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: 'Sokha Chan',
          email: demoEmail,
          phone: '+855 12 345 678',
          passwordHash,
          emailVerifiedAt: new Date(),
          status: 'ACTIVE',
        },
      });

      const tenant = await tx.tenant.create({
        data: {
          name: 'BayV Accessories',
          slug: 'bayv-accessories',
          businessType: 'ELECTRONICS',
          email: 'hello@bayv.com.kh',
          phone: '+855 23 999 888',
          address: 'Street 271, Sangkat Boeung Tompun, Phnom Penh',
          defaultCurrency: 'USD',
          defaultLanguage: 'en',
          timezone: 'Asia/Phnom_Penh',
          status: 'ACTIVE',
        },
      });

      const ppBranch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: 'Phnom Penh Main',
          branchCode: 'PP-01',
          phone: '+855 23 999 888',
          address: 'Phnom Penh, Cambodia',
          isMain: true,
          status: 'ACTIVE',
        },
      });

      const srBranch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: 'Siem Reap Branch',
          branchCode: 'SR-01',
          phone: '+855 63 888 777',
          address: 'Sivutha Blvd, Siem Reap, Cambodia',
          isMain: false,
          status: 'ACTIVE',
        },
      });

      const tenantUser = await tx.tenantUser.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          status: 'ACTIVE',
        },
      });

      const ownerRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: 'Business Owner',
          description: 'Full access to all business operations and settings',
          isSystem: true,
        },
      });

      await tx.rolePermission.createMany({
        data: allPermissions.map((p) => ({
          roleId: ownerRole.id,
          permissionId: p.id,
        })),
      });

      await tx.userRole.create({
        data: {
          tenantUserId: tenantUser.id,
          roleId: ownerRole.id,
        },
      });

      const employee = await tx.employee.create({
        data: {
          tenantId: tenant.id,
          tenantUserId: tenantUser.id,
          employeeCode: 'EMP-001',
          name: user.name,
          phone: user.phone,
          email: user.email,
          position: 'Business Owner',
          hireDate: new Date(),
          status: 'ACTIVE',
        },
      });

      await tx.employeeBranchAccess.createMany({
        data: [
          { employeeId: employee.id, branchId: ppBranch.id },
          { employeeId: employee.id, branchId: srBranch.id },
        ],
      });

      await tx.exchangeRate.create({
        data: {
          tenantId: tenant.id,
          baseCurrency: 'USD',
          targetCurrency: 'KHR',
          rate: DEFAULT_USD_TO_KHR_RATE,
        },
      });

      // Starter Categories, Units, Supplier & Products
      const cablesCat = await tx.category.create({
        data: { tenantId: tenant.id, name: 'Charging & Cables', status: 'ACTIVE' },
      });
      const audioCat = await tx.category.create({
        data: { tenantId: tenant.id, name: 'Audio & Headsets', status: 'ACTIVE' },
      });

      const pcsUnit = await tx.unit.create({
        data: { tenantId: tenant.id, name: 'Piece', abbreviation: 'pcs', status: 'ACTIVE' },
      });
      await tx.unit.create({
        data: { tenantId: tenant.id, name: 'Box', abbreviation: 'box', status: 'ACTIVE' },
      });

      await tx.supplier.create({
        data: {
          tenantId: tenant.id,
          name: 'Phnom Penh Tech Wholesale',
          contactPerson: 'Mony Reach',
          phone: '+855 23 555 444',
          address: 'Orussey Market Area, Phnom Penh',
          status: 'ACTIVE',
        },
      });

      const sampleProducts = [
        {
          categoryId: cablesCat.id,
          unitId: pcsUnit.id,
          sku: 'CAB-USBC-2M',
          barcode: '885000100001',
          name: 'USB-C Fast Charging Cable 2m',
          costPrice: '2.50',
          sellingPrice: '6.00',
          lowStockAlert: '10',
          openingStock: '45',
        },
        {
          categoryId: cablesCat.id,
          unitId: pcsUnit.id,
          sku: 'CHG-GAN-20W',
          barcode: '885000100002',
          name: '20W USB-C GaN Wall Adapter',
          costPrice: '5.50',
          sellingPrice: '12.50',
          lowStockAlert: '8',
          openingStock: '25',
        },
        {
          categoryId: audioCat.id,
          unitId: pcsUnit.id,
          sku: 'EAR-TWS-01',
          barcode: '885000100003',
          name: 'TWS Bluetooth Earbuds Pro',
          costPrice: '11.00',
          sellingPrice: '24.00',
          lowStockAlert: '5',
          openingStock: '15',
        },
      ];

      for (const item of sampleProducts) {
        const product = await tx.product.create({
          data: {
            tenantId: tenant.id,
            categoryId: item.categoryId,
            unitId: item.unitId,
            sku: item.sku,
            barcode: item.barcode,
            name: item.name,
            costPrice: item.costPrice,
            sellingPrice: item.sellingPrice,
            lowStockAlert: item.lowStockAlert,
            trackInventory: true,
            status: 'ACTIVE',
          },
        });

        await tx.stockBalance.create({
          data: {
            tenantId: tenant.id,
            branchId: ppBranch.id,
            productId: product.id,
            quantity: item.openingStock,
          },
        });

        await tx.stockMovement.create({
          data: {
            tenantId: tenant.id,
            branchId: ppBranch.id,
            productId: product.id,
            movementType: 'opening_stock',
            quantityIn: item.openingStock,
            quantityOut: '0',
            balanceAfter: item.openingStock,
            referenceType: 'Product',
            referenceId: product.id,
            notes: 'Demo seed opening stock',
            createdBy: employee.id,
          },
        });
      }

      await tx.customer.create({
        data: {
          tenantId: tenant.id,
          customerCode: 'CUST-0001',
          name: 'Vannak Sok',
          phone: '+855 12 222 333',
          address: 'Toul Kork, Phnom Penh',
          status: 'ACTIVE',
        },
      });

      await tx.expenseType.createMany({
        data: [
          { tenantId: tenant.id, name: 'Utilities', description: 'Electricity & Water (EDC / PPWSA)' },
          { tenantId: tenant.id, name: 'Shop Rent', description: 'Monthly branch rental' },
          { tenantId: tenant.id, name: 'Staff Meals & Supplies', description: 'Daily shop petty cash' },
        ],
      });

      await tx.activityLog.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          employeeId: employee.id,
          action: 'tenant.seeded',
          module: 'tenants',
          recordType: 'Tenant',
          recordId: tenant.id,
          newValues: { name: tenant.name, slug: tenant.slug },
        },
      });
    });

    console.log(`Demo owner created: ${demoEmail} / Demo1234!`);
  }

  const platformAdminEmail = 'platform@cambodiapos.kh';
  const existingPlatformAdmin = await prisma.user.findUnique({
    where: { email: platformAdminEmail },
  });
  if (!existingPlatformAdmin) {
    await prisma.user.create({
      data: {
        name: 'SaaS Platform Admin',
        email: platformAdminEmail,
        phone: '+855 23 000 001',
        passwordHash: await bcrypt.hash('Admin1234!', 10),
        emailVerifiedAt: new Date(),
        isPlatformAdmin: true,
        status: 'ACTIVE',
      },
    });
    console.log(`Platform admin created: ${platformAdminEmail} / Admin1234!`);
  }

  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
