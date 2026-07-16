import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  Param,
  UseGuards,
  Header,
  Req,
  Delete,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AdminGuard } from '../../guards/admin.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@SkipThrottle()
export class AdminController {
  constructor(private adminService: AdminService) {
    // Defensive: if reflect-metadata isn't loaded before NestJS boots,
    // DI may fail to inject the service. Since AdminService has no
    // injected dependencies, we can safely instantiate it directly.
    if (!this.adminService) {
      this.adminService = new AdminService();
    }
  }

  @Get('dashboard')
  @Header('Content-Type', 'text/html')
  getDashboard() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; img-src 'self' data: https://*.shopify.com https://*.shopifycdn.com https://images.unsplash.com https://pub-*.r2.dev; connect-src 'self'; frame-ancestors 'none';">
  <title>Virtual-Trail | SaaS Cost & Analytics Panel</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" integrity="sha512-iecdLmaskl7CVkqkXNQ/ZH/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT/E0iPtmFIB46ZmdtAc9eNBvH0H/ZpiBw==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js" integrity="sha256-CN+kcwVxsjgQw0/DnFEBRh7K/KVsP5LK9IUFCcsVjzA=" crossorigin="anonymous"></script>
  <script src="https://cdn.tailwindcss.com/3.4.1"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            outfit: ['Outfit', 'sans-serif'],
            inter: ['Inter', 'sans-serif'],
          }
        }
      }
    }
  </script>
  <style>
    body {
      background-color: #08090f;
      background-image: 
        radial-gradient(at 0% 0%, rgba(138, 43, 226, 0.15) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(0, 245, 255, 0.1) 0px, transparent 50%);
      font-family: 'Inter', sans-serif;
    }
    .glass-card {
      background: rgba(22, 23, 38, 0.6);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
    }
    .glow-purple:hover {
      box-shadow: 0 0 20px rgba(138, 43, 226, 0.4);
      transform: translateY(-2px);
      transition: all 0.3s ease;
    }
    .scrollbar-hide::-webkit-scrollbar {
      display: none;
    }
  </style>
</head>
<body class="text-slate-100 min-h-screen pb-12 overflow-y-auto scrollbar-hide">
  <!-- Nav Bar -->
  <header class="w-full glass-card border-t-0 border-x-0 py-4 px-6 md:px-12 flex justify-between items-center mb-8 sticky top-0 z-50">
    <div class="flex items-center gap-3">
      <div class="h-10 w-10 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-400 flex items-center justify-center font-outfit font-bold text-xl shadow-lg shadow-purple-500/20">
        VT
      </div>
      <div>
        <h1 class="font-outfit font-bold text-lg tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300">Virtual-Trail</h1>
        <p class="text-xs text-purple-400 font-medium">SaaS Operational Console</p>
      </div>
    </div>
    
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
        <span class="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
        API Operational
      </div>
      <button onclick="handleClearQueues()" class="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold font-outfit shadow-lg shadow-red-600/30 transition-all flex items-center gap-2">
        <i class="fa-solid fa-trash-can"></i> Clear/Reset Queues
      </button>
      <a href="/admin/queues" target="_blank" class="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold font-outfit shadow-lg shadow-purple-600/30 transition-all flex items-center gap-2">
        <i class="fa-solid fa-server"></i> Bull Board Queues
      </a>
    </div>
  </header>

  <!-- Container -->
  <main class="max-w-7xl mx-auto px-4 md:px-8">
    <div class="flex flex-col gap-8">
      
      <!-- Summary Cards -->
      <section class="grid grid-cols-1 md:grid-cols-4 gap-6">
        <!-- Card 1 -->
        <div class="glass-card rounded-2xl p-6 glow-purple flex flex-col justify-between min-h-[140px] transition-all">
          <div class="flex justify-between items-center text-slate-400">
            <span class="text-xs font-semibold tracking-wider font-outfit uppercase">Active Merchants</span>
            <i class="fa-solid fa-store text-purple-400 text-lg"></i>
          </div>
          <div>
            <h2 id="stat-tenants" class="font-outfit font-bold text-4xl mt-2 tracking-tight text-white">-</h2>
            <p class="text-xs text-slate-500 mt-1">onboarded shopify brands</p>
          </div>
        </div>

        <!-- Card 2 -->
        <div class="glass-card rounded-2xl p-6 glow-purple flex flex-col justify-between min-h-[140px] transition-all">
          <div class="flex justify-between items-center text-slate-400">
            <span class="text-xs font-semibold tracking-wider font-outfit uppercase">Total Try-On Requests</span>
            <i class="fa-solid fa-wand-magic-sparkles text-cyan-400 text-lg"></i>
          </div>
          <div>
            <h2 id="stat-requests" class="font-outfit font-bold text-4xl mt-2 tracking-tight text-white">-</h2>
            <p class="text-xs text-slate-500 mt-1" id="stat-success-rate">success rate: -%</p>
          </div>
        </div>

        <!-- Card 3 -->
        <div class="glass-card rounded-2xl p-6 glow-purple flex flex-col justify-between min-h-[140px] transition-all">
          <div class="flex justify-between items-center text-slate-400">
            <span class="text-xs font-semibold tracking-wider font-outfit uppercase">Active Cloud Cost</span>
            <i class="fa-solid fa-wallet text-emerald-400 text-lg"></i>
          </div>
          <div>
            <h2 id="stat-cost" class="font-outfit font-bold text-4xl mt-2 tracking-tight text-emerald-400">₹0.00</h2>
            <p class="text-xs text-slate-500 mt-1">Fittroom GPU + Gemini LLM fees (INR)</p>
          </div>
        </div>

        <!-- Card 4 -->
        <div class="glass-card rounded-2xl p-6 glow-purple border-purple-500/20 bg-gradient-to-br from-purple-950/20 to-transparent flex flex-col justify-between min-h-[140px] transition-all">
          <div class="flex justify-between items-center text-slate-400">
            <span class="text-xs font-semibold tracking-wider font-outfit uppercase">Profit Optimization</span>
            <i class="fa-solid fa-bolt text-yellow-400 text-lg"></i>
          </div>
          <div>
            <h2 id="stat-savings" class="font-outfit font-bold text-4xl mt-2 tracking-tight text-yellow-400">₹0.00</h2>
            <p class="text-xs text-purple-300 mt-1 font-medium">saved via Upstash Redis Caching!</p>
          </div>
        </div>
      </section>

      <!-- Charts Section -->
      <section class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Chart 1 -->
        <div class="glass-card rounded-2xl p-6 flex flex-col">
          <h3 class="font-outfit font-semibold text-sm tracking-wider uppercase text-slate-400 mb-6 flex items-center gap-2">
            <i class="fa-solid fa-chart-pie text-cyan-400"></i> SaaS Cost Allocation
          </h3>
          <div class="flex-1 flex justify-center items-center max-h-[260px] pb-4">
            <canvas id="costChart"></canvas>
          </div>
        </div>

        <!-- Chart 2 -->
        <div class="glass-card rounded-2xl p-6 flex flex-col">
          <h3 class="font-outfit font-semibold text-sm tracking-wider uppercase text-slate-400 mb-6 flex items-center gap-2">
            <i class="fa-solid fa-gauge-high text-yellow-400"></i> Upstash Cache Efficiency
          </h3>
          <div class="flex-1 flex justify-center items-center max-h-[260px] pb-4">
            <canvas id="cacheChart"></canvas>
          </div>
        </div>
      </section>

      <!-- Details Section -->
      <section class="glass-card rounded-2xl p-6">
        <div class="flex justify-between items-center mb-6">
          <h3 class="font-outfit font-semibold text-sm tracking-wider uppercase text-slate-400 flex items-center gap-2">
            <i class="fa-solid fa-users-gear text-purple-400"></i> Active Merchant Economics
          </h3>
          <div class="text-xs text-slate-500 font-medium" id="stat-latency">
            Avg Processing Latency: <span class="text-cyan-400 font-semibold">- ms</span>
          </div>
        </div>
        
        <div class="overflow-x-auto w-full">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-white/5 text-slate-500 font-outfit uppercase font-semibold">
                <th class="pb-3 pl-2">Merchant Name</th>
                <th class="pb-3">Shopify Domain</th>
                <th class="pb-3 text-center">Requests</th>
                <th class="pb-3 text-center text-emerald-400">This Month Req</th>
                <th class="pb-3 text-center font-semibold">Fittroom GPU</th>
                <th class="pb-3 text-center font-semibold">Gemini LLM</th>
                <th class="pb-3 text-center text-yellow-400">Redis Savings</th>
                <th class="pb-3 text-center font-bold text-white">This Month Cost</th>
                <th class="pb-3 pr-2 text-right">Total Cost</th>
              </tr>
            </thead>
            <tbody id="merchant-rows" class="divide-y divide-white/5">
              <!-- Loading Row -->
              <tr>
                <td colspan="8" class="py-8 text-center text-slate-500">
                  <i class="fa-solid fa-circle-notch animate-spin text-purple-400 text-lg mr-2"></i> Loading merchant economics...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Customer Session Management Section -->
      <section class="glass-card rounded-2xl p-6 mb-8">
        <div class="flex justify-between items-center mb-6">
          <h3 class="font-outfit font-semibold text-sm tracking-wider uppercase text-slate-400 flex items-center gap-2">
            <i class="fa-solid fa-users text-purple-400"></i> Customer Session Management
          </h3>
        </div>
        
        <div class="overflow-x-auto w-full">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="border-b border-white/5 text-slate-500 font-outfit uppercase font-semibold">
                <th class="pb-3 pl-2">Merchant Name</th>
                <th class="pb-3">Phone</th>
                <th class="pb-3">Session Details</th>
                <th class="pb-3">Last Seen</th>
                <th class="pb-3">Expires At</th>
                <th class="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody id="customers-rows" class="divide-y divide-white/5">
              <!-- Loading Row -->
              <tr>
                <td colspan="6" class="py-8 text-center text-slate-500">
                  <i class="fa-solid fa-circle-notch animate-spin text-purple-400 text-lg mr-2"></i> Loading customers...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

    </div>
  </main>

  <script>
    // No secrets in this page. The browser automatically includes HTTP Basic Auth
    // credentials (cached from the initial dashboard auth challenge) for all
    // same-origin /admin/* requests. The AdminGuard on the API side accepts
    // both X-Admin-Api-Key header and Authorization: Basic header.
    async function loadDashboard() {
      try {
        const [analyticsRes, costsRes] = await Promise.all([
          fetch('/admin/analytics').then(r => r.json()),
          fetch('/admin/costs').then(r => r.json())
        ]);

        // 1. Load Stats
        document.getElementById('stat-tenants').innerText = analyticsRes.totals.tenants;
        document.getElementById('stat-requests').innerText = analyticsRes.totals.requests.toLocaleString();
        document.getElementById('stat-success-rate').innerText = 'success rate: ' + analyticsRes.successRate + '%';
        document.getElementById('stat-cost').innerText = '₹' + costsRes.summary.totalCost.toFixed(2);
        document.getElementById('stat-savings').innerText = '₹' + costsRes.summary.totalRedisSavings.toFixed(2);
        document.getElementById('stat-latency').innerHTML = 'Avg Latency: <span class="text-cyan-400 font-semibold">' + analyticsRes.avgProcessingTimeMs + ' ms</span>';

        // 2. Load Cost Allocation Chart
        new Chart(document.getElementById('costChart'), {
          type: 'doughnut',
          data: {
            labels: ['Fittroom Try-On GPU', 'Gemini Flash text LLM'],
            datasets: [{
              data: [costsRes.summary.totalSegmindCost, costsRes.summary.totalGeminiCost],
              backgroundColor: ['#8A2BE2', '#00F5FF'],
              borderColor: 'rgba(255,255,255,0.08)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
              }
            }
          }
        });

        // 3. Load Cache Chart
        const cacheMisses = analyticsRes.totals.requests - (analyticsRes.totals.requests * (analyticsRes.cacheHitRatio / 100));
        const cacheHits = analyticsRes.totals.requests - cacheMisses;
        new Chart(document.getElementById('cacheChart'), {
          type: 'doughnut',
          data: {
            labels: ['Redis Cache Hits', 'Gemini API Misses'],
            datasets: [{
              data: [cacheHits, cacheMisses],
              backgroundColor: ['#00FF7F', 'rgba(255, 255, 255, 0.05)'],
              borderColor: 'rgba(255,255,255,0.08)',
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
              }
            }
          }
        });

        // 4. Load Merchant Economics Table
        const rowsContainer = document.getElementById('merchant-rows');
        rowsContainer.innerHTML = '';

        if (costsRes.tenants.length === 0) {
          rowsContainer.innerHTML = '<tr><td colspan="8" class="py-8 text-center text-slate-500">No active merchants found</td></tr>';
          return;
        }

        costsRes.tenants.forEach(t => {
          const row = document.createElement('tr');
          row.className = 'hover:bg-white/[0.02] transition-colors';
          row.innerHTML = \`
            <td class="py-4 pl-2 font-semibold text-white font-outfit">\${t.tenantName}</td>
            <td class="py-4 text-slate-400 font-mono">\${t.shopifyDomain || 'N/A'}</td>
            <td class="py-4 text-center font-medium">\${t.totalRequests}</td>
            <td class="py-4 text-center text-emerald-400 font-bold">\${t.thisMonthRequests}</td>
            <td class="py-4 text-center font-medium text-purple-400">₹\${t.segmindCost.toFixed(2)}</td>
            <td class="py-4 text-center font-medium text-cyan-400">₹\${t.geminiCost.toFixed(2)}</td>
            <td class="py-4 text-center font-medium text-yellow-400">₹\${t.redisSavings.toFixed(2)}</td>
            <td class="py-4 text-center font-bold text-white">₹\${t.thisMonthCost.toFixed(2)}</td>
            <td class="py-4 pr-2 text-right font-bold text-slate-400">₹\${t.totalCost.toFixed(2)}</td>
          \`;
          rowsContainer.appendChild(row);
        });

      } catch (err) {
        console.error(err);
        document.getElementById('merchant-rows').innerHTML = '<tr><td colspan="8" class="py-8 text-center text-red-400 font-medium">Failed to load dashboard metrics. Check console.</td></tr>';
      }
    }

    async function loadCustomers() {
      try {
        const customersRes = await fetch('/admin/customers').then(r => r.json());
        let customersHtml = '';
        if (customersRes.length === 0) {
          customersHtml = '<tr><td colspan="6" class="py-4 text-center text-slate-500 font-medium">No customers found.</td></tr>';
        } else {
          for (const customer of customersRes) {
            for (const session of customer.sessions) {
              if (session.isActive) {
                customersHtml += `
                  <tr class="hover:bg-white/5 transition-colors border-b border-white/5">
                    <td class="py-4 pl-2 font-medium text-slate-200">${customer.tenant.name}</td>
                    <td class="py-4 font-medium text-slate-200">+${customer.countryCode} ${customer.phone}</td>
                    <td class="py-4 text-slate-400">Trusted Browser</td>
                    <td class="py-4 text-slate-400">${new Date(session.lastSeenAt).toLocaleString()}</td>
                    <td class="py-4 text-slate-400">${session.expiresAt ? new Date(session.expiresAt).toLocaleDateString() : 'N/A'}</td>
                    <td class="py-4 pr-2 text-right">
                      <button onclick="revokeSession('${session.id}')" class="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 transition-colors">
                        Revoke
                      </button>
                    </td>
                  </tr>
                `;
              }
            }
          }
          if (!customersHtml) {
            customersHtml = '<tr><td colspan="6" class="py-4 text-center text-slate-500 font-medium">No active sessions found.</td></tr>';
          }
        }
        document.getElementById('customers-rows').innerHTML = customersHtml;
      } catch (err) {
        console.error(err);
        document.getElementById('customers-rows').innerHTML = '<tr><td colspan="6" class="py-8 text-center text-red-400 font-medium">Failed to load customers. Check console.</td></tr>';
      }
    }

    async function revokeSession(sessionId) {
      if (!confirm('Are you sure you want to revoke this session? The customer will be prompted for OTP on their next visit.')) return;
      try {
        const res = await fetch('/admin/sessions/' + sessionId, { method: 'DELETE' });
        if (res.ok) {
          loadCustomers(); // reload to reflect changes
        } else {
          alert('Failed to revoke session');
        }
      } catch (e) {
        console.error(e);
        alert('Failed to revoke session');
      }
    }

    loadDashboard();
    loadCustomers();

    async function handleClearQueues() {
      if (!confirm('Are you sure you want to completely clear and reset all tryon queues? This will delete all pending, retrying, and DLQ jobs.')) {
        return;
      }
      try {
        const btn = document.querySelector('button[onclick="handleClearQueues()"]');
        const origContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Clearing...';
        
        const res = await fetch('/admin/queues/clear', {
          method: 'POST',
        });
        
        if (res.ok) {
          alert('All queues cleared successfully!');
          window.location.reload();
        } else {
          alert('Failed to clear queues: ' + res.statusText);
          btn.disabled = false;
          btn.innerHTML = origContent;
        }
      } catch (err) {
        alert('Failed to clear queues: ' + err.message);
      }
    }
  </script>
</body>
</html>`;
  }

  @Get('tenants')
  @UseGuards(AdminGuard)
  async getTenants() {
    return this.adminService.getTenants();
  }

  @Post('tenants')
  @UseGuards(AdminGuard)
  async createTenant(
    @Req() req: Request,
    @Body()
    body: {
      name: string;
      shopifyDomain: string;
      features?: string[];
      primaryColor?: string;
      complimentTone?: string;
      segmindModel?: string;
      logoUrl?: string;
      buttonStyle?: string;
      widgetTheme?: string;
    }
  ) {
    return this.adminService.createTenant(body, 'admin', req.ip);
  }

  @Get('requests')
  @UseGuards(AdminGuard)
  async getRequests(
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string
  ) {
    return this.adminService.getRequests({ tenantId, status });
  }

  @Get('analytics')
  @UseGuards(AdminGuard)
  async getAnalytics() {
    return this.adminService.getAnalytics();
  }

  @Get('costs')
  @UseGuards(AdminGuard)
  async getCosts() {
    return this.adminService.getCosts();
  }

  @Get('cost-estimate')
  @UseGuards(AdminGuard)
  async getCostEstimate() {
    return this.adminService.getCosts();
  }

  @Get('tenants/:id')
  @UseGuards(AdminGuard)
  async getTenantById(@Param('id') id: string) {
    return this.adminService.getTenantById(id);
  }

  @Patch('tenants/:id')
  @UseGuards(AdminGuard)
  async updateTenant(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.adminService.updateTenant(id, body, 'admin', req.ip);
  }

  @Post('tenants/:id/config')
  @UseGuards(AdminGuard)
  async upsertTenantConfig(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.adminService.upsertTenantConfig(id, body, 'admin', req.ip);
  }

  @Patch('tenants/:id/config')
  @UseGuards(AdminGuard)
  async updateTenantConfig(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.adminService.updateTenantConfig(id, body, 'admin', req.ip);
  }

  @Get('tenants/:id/analytics')
  @UseGuards(AdminGuard)
  async getTenantAnalytics(@Param('id') id: string) {
    return this.adminService.getTenantAnalytics(id);
  }

  @Post('products/:id/preferred-image')
  @UseGuards(AdminGuard)
  async setPreferredGarmentImage(
    @Param('id') id: string,
    @Body('imageUrl') imageUrl: string
  ) {
    return this.adminService.setPreferredGarmentImage(id, imageUrl);
  }

  @Get('products/:id/guidance')
  @UseGuards(AdminGuard)
  async getImageSelectionGuidance() {
    return this.adminService.getImageSelectionGuidance();
  }

  @Post('queues/clear')
  @UseGuards(AdminGuard)
  async clearQueues() {
    return this.adminService.clearQueues();
  }

  @Get('customers')
  @UseGuards(AdminGuard)
  async getCustomers(@Query('tenantId') tenantId?: string) {
    return this.adminService.getCustomers(tenantId);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(AdminGuard)
  async revokeSession(@Param('sessionId') sessionId: string) {
    return this.adminService.revokeSession(sessionId);
  }
}

