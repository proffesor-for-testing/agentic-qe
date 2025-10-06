import * as fs from 'fs/promises';
import * as path from 'path';

export interface Alert {
  id: string;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
  resolved: boolean;
  acknowledged?: boolean;
  acknowledgedBy?: string;
}

export interface AlertRule {
  metric: string;
  condition: 'above' | 'below' | 'equals';
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
}

export interface ListOptions {
  status?: 'active' | 'resolved' | 'all';
  severity?: 'info' | 'warning' | 'critical';
  type?: string;
}

export class MonitorAlerts {
  private dataDir: string;
  private alertsFile: string;
  private rulesFile: string;
  private alerts: Alert[] = [];
  private rules: AlertRule[] = [];

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.alertsFile = path.join(dataDir, 'alerts.json');
    this.rulesFile = path.join(dataDir, 'rules.json');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });
    await this.loadAlerts();
    await this.loadRules();
  }

  private async loadAlerts(): Promise<void> {
    try {
      const data = await fs.readFile(this.alertsFile, 'utf-8');
      this.alerts = JSON.parse(data);
    } catch {
      this.alerts = [];
    }
  }

  private async loadRules(): Promise<void> {
    try {
      const data = await fs.readFile(this.rulesFile, 'utf-8');
      this.rules = JSON.parse(data);
    } catch {
      this.rules = [];
    }
  }

  private async saveAlerts(): Promise<void> {
    await fs.writeFile(
      this.alertsFile,
      JSON.stringify(this.alerts, null, 2),
      'utf-8'
    );
  }

  private async saveRules(): Promise<void> {
    await fs.writeFile(
      this.rulesFile,
      JSON.stringify(this.rules, null, 2),
      'utf-8'
    );
  }

  async addAlert(alert: Alert): Promise<void> {
    await this.loadAlerts();
    this.alerts.push(alert);
    await this.saveAlerts();
  }

  async list(options?: ListOptions): Promise<Alert[]> {
    await this.loadAlerts();
    let filtered = [...this.alerts];

    if (options?.status) {
      if (options.status === 'active') {
        filtered = filtered.filter(a => !a.resolved);
      } else if (options.status === 'resolved') {
        filtered = filtered.filter(a => a.resolved);
      }
    }

    if (options?.severity) {
      filtered = filtered.filter(a => a.severity === options.severity);
    }

    if (options?.type) {
      filtered = filtered.filter(a => a.type === options.type);
    }

    return filtered;
  }

  async getAlert(id: string): Promise<Alert | undefined> {
    await this.loadAlerts();
    return this.alerts.find(a => a.id === id);
  }

  async resolve(id: string): Promise<{ success: boolean }> {
    await this.loadAlerts();
    const alert = this.alerts.find(a => a.id === id);

    if (!alert) {
      return { success: false };
    }

    alert.resolved = true;
    await this.saveAlerts();
    return { success: true };
  }

  async acknowledge(id: string, user: string): Promise<void> {
    await this.loadAlerts();
    const alert = this.alerts.find(a => a.id === id);

    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedBy = user;
      await this.saveAlerts();
    }
  }

  async addRule(rule: AlertRule): Promise<void> {
    await this.loadRules();
    this.rules.push(rule);
    await this.saveRules();
  }

  async getRules(): Promise<AlertRule[]> {
    await this.loadRules();
    return [...this.rules];
  }

  async evaluateRules(metrics: Record<string, number>): Promise<Alert[]> {
    await this.loadRules();
    const triggeredAlerts: Alert[] = [];

    for (const rule of this.rules) {
      const value = metrics[rule.metric];

      if (value === undefined) continue;

      let triggered = false;
      switch (rule.condition) {
        case 'above':
          triggered = value > rule.threshold;
          break;
        case 'below':
          triggered = value < rule.threshold;
          break;
        case 'equals':
          triggered = value === rule.threshold;
          break;
      }

      if (triggered) {
        const alert: Alert = {
          id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: rule.metric,
          severity: rule.severity,
          message: `${rule.metric} is ${rule.condition} threshold ${rule.threshold} (current: ${value})`,
          timestamp: Date.now(),
          resolved: false,
        };
        triggeredAlerts.push(alert);
      }
    }

    return triggeredAlerts;
  }
}
