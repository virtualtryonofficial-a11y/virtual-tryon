import { Controller, Get, Param, UseGuards, Req, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { TenantGuard } from '../../guards/tenant.guard';
import { TenantsService } from './tenants.service';

@Controller('v1/tenant')
@SkipThrottle({ tryon: true })
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get(':tenantId/config')
  @UseGuards(TenantGuard)
  async getConfig(@Req() req: any) {
    const tenant = req.tenant;
    return {
      primaryColor: tenant.primaryColor,
      complimentTone: tenant.complimentTone,
      logoUrl: tenant.logoUrl,
      buttonStyle: tenant.buttonStyle || 'rounded',
      widgetTheme: tenant.widgetTheme || 'light',
      features: tenant.features,
    };
  }

  @Get(':tenantId/analytics')
  async getPublicAnalytics(@Param('tenantId') tenantId: string) {
    // This is public, but secured by the unguessable UUID.
    return this.tenantsService.getPublicTenantAnalytics(tenantId);
  }

  @Get('dashboard/:tenantId')
  @Header('Content-Type', 'text/html')
  async getDashboard(@Param('tenantId') tenantId: string) {
    // Ensure the tenant actually exists before returning the dashboard
    await this.tenantsService.getPublicTenantAnalytics(tenantId);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Merchant Try-On Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {
      background-color: #0f111a;
      color: #e2e8f0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
    }
    .glass-card {
      background: rgba(30, 33, 48, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(10px);
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
  </style>
</head>
<body class="min-h-screen p-6 md:p-12">
  <div class="max-w-5xl mx-auto space-y-8">
    
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-6">
      <div>
        <h1 class="text-2xl font-bold text-white tracking-tight" id="header-title">Loading Dashboard...</h1>
        <p class="text-sm text-slate-400 mt-1">Virtual Try-On Usage Analytics</p>
      </div>
      <div class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
        <span class="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
        System Active
      </div>
    </header>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <div class="glass-card rounded-2xl p-6">
        <p class="text-sm font-medium text-slate-400">This Month's Try-Ons</p>
        <p class="text-3xl font-bold text-white mt-2" id="stat-this-month">-</p>
        <p class="text-xs text-slate-500 mt-1" id="stat-total">Total All-Time: -</p>
      </div>
      <div class="glass-card rounded-2xl p-6">
        <p class="text-sm font-medium text-slate-400">Completed Looks</p>
        <p class="text-3xl font-bold text-emerald-400 mt-2" id="stat-completed">-</p>
      </div>
      <div class="glass-card rounded-2xl p-6">
        <p class="text-sm font-medium text-slate-400">Success Rate</p>
        <p class="text-3xl font-bold text-cyan-400 mt-2" id="stat-success-rate">-</p>
      </div>
      <div class="glass-card rounded-2xl p-6">
        <p class="text-sm font-medium text-slate-400">Avg Generation Time</p>
        <p class="text-3xl font-bold text-purple-400 mt-2" id="stat-avg-time">-</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 glass-card rounded-2xl p-6">
        <h3 class="text-base font-semibold text-white mb-6">Usage This Month</h3>
        <div class="h-[300px] w-full">
          <canvas id="usageChart"></canvas>
        </div>
      </div>
      
      <div class="glass-card rounded-2xl p-6 flex flex-col">
        <h3 class="text-base font-semibold text-white mb-6">Status Breakdown</h3>
        <div class="flex-1 flex justify-center items-center h-[200px]">
          <canvas id="statusChart"></canvas>
        </div>
      </div>
    </div>
  </div>

  <script>
    const tenantId = "${tenantId}";
    
    async function init() {
      try {
        const res = await fetch(\`/v1/tenant/\${tenantId}/analytics\`);
        if (!res.ok) throw new Error('Failed to fetch analytics');
        const data = await res.json();

        document.getElementById('header-title').textContent = data.tenantName;
        document.getElementById('stat-this-month').textContent = data.thisMonthTotal.toLocaleString();
        document.getElementById('stat-total').textContent = 'Total All-Time: ' + data.totalTryons.toLocaleString();
        document.getElementById('stat-completed').textContent = data.completedCount.toLocaleString();
        document.getElementById('stat-success-rate').textContent = data.successRate + '%';
        document.getElementById('stat-avg-time').textContent = (data.avgProcessingTimeMs / 1000).toFixed(1) + 's';

        // Usage Chart
        const labels = data.thisMonthDaily.map(d => {
          const date = new Date(d.date);
          return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        });
        const counts = data.thisMonthDaily.map(d => d.count);

        new Chart(document.getElementById('usageChart'), {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Successful Try-Ons',
              data: counts,
              backgroundColor: 'rgba(16, 185, 129, 0.8)',
              borderRadius: 4,
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
              x: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
          }
        });

        // Status Chart
        new Chart(document.getElementById('statusChart'), {
          type: 'doughnut',
          data: {
            labels: ['Completed', 'Failed', 'Processing/Queued'],
            datasets: [{
              data: [data.completedCount, data.failedCount, data.queuedCount + data.processingCount],
              backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
              legend: { position: 'bottom', labels: { color: '#94a3b8', padding: 20, font: { size: 12 } } }
            }
          }
        });

      } catch (err) {
        console.error(err);
        document.getElementById('header-title').textContent = 'Error Loading Dashboard';
        document.getElementById('header-title').classList.add('text-red-400');
      }
    }

    init();
  </script>
</body>
</html>`;
  }
}
