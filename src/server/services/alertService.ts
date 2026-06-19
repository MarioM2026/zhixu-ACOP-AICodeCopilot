/**
 * 告警通知服务
 * 支持钉钉、邮件、Webhook 等多种通知渠道
 */

import { logger } from './logger';

export interface Alert {
  id: string;
  ruleId: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message: string;
  timestamp: number;
  acknowledged: boolean;
}

export interface DingtalkConfig {
  webhookUrl: string;
  secret?: string;
  atMobiles?: string[];
  isAtAll?: boolean;
}

export interface EmailConfig {
  smtpServer: string;
  smtpPort: number;
  username: string;
  password: string;
  toEmails: string;
}

export interface WebhookConfig {
  url: string;
  secret?: string;
  headers?: Record<string, string>;
}

export interface TestResult {
  success: boolean;
  message: string;
  details?: string;
}

const testAlert: Alert = {
  id: 'test-' + Date.now(),
  ruleId: 'test-rule',
  severity: 'info',
  title: '知墟 测试告警',
  message: '这是一条测试告警，用于验证告警通道配置是否正确。',
  timestamp: Date.now(),
  acknowledged: false,
};

export async function sendTestAlert(
  channel: string,
  config?: DingtalkConfig | EmailConfig | WebhookConfig,
): Promise<TestResult> {
  switch (channel) {
    case 'dingtalk':
      return await testDingtalk(config as DingtalkConfig);
    case 'email':
      return await testEmail(config as EmailConfig);
    case 'webhook':
      return await testWebhook(config as WebhookConfig);
    default:
      return { success: false, message: '未知的告警渠道' };
  }
}

async function testDingtalk(config: DingtalkConfig): Promise<TestResult> {
  if (!config?.webhookUrl) {
    return { success: false, message: '请先填写钉钉 Webhook 地址' };
  }

  try {
    const severityEmoji = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      critical: '🚨',
    };

    let url = config.webhookUrl;

    if (config.secret) {
      const timestamp = Date.now();
      const stringToSign = `${timestamp}\n${config.secret}`;

      const encoder = new TextEncoder();
      const data = encoder.encode(stringToSign);

      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(config.secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);

      const sigArray = Array.from(new Uint8Array(signature));
      const sigHex = sigArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      const sigBase64 = btoa(unescape(encodeURIComponent(String.fromCharCode(...sigArray))));

      const sign = encodeURIComponent(sigBase64);
      url = `${config.webhookUrl}&timestamp=${timestamp}&sign=${sign}`;
    }

    const message = {
      msgtype: 'markdown',
      markdown: {
        title: `${severityEmoji[testAlert.severity]} ${testAlert.title}`,
        text: `### ${testAlert.title}\n\n**严重程度**: ${testAlert.severity}\n\n**描述**: ${testAlert.message}\n\n**时间**: ${new Date(testAlert.timestamp).toLocaleString('zh-CN')}\n\n**规则ID**: ${testAlert.ruleId}\n\n---\n> 知墟 (ZhiXu) 告警系统`,
      },
      at: {
        atMobiles: config.atMobiles || [],
        isAtAll: config.isAtAll || false,
      },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    const data = await response.json();

    if (data.errcode === 0) {
      return { success: true, message: '钉钉测试消息发送成功' };
    } else {
      return {
        success: false,
        message: '钉钉测试消息发送失败',
        details: data.errmsg || '未知错误',
      };
    }
  } catch (error) {
    logger.error('Dingtalk test failed', { error: String(error) });
    return {
      success: false,
      message: '钉钉测试消息发送失败',
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testEmail(config: EmailConfig): Promise<TestResult> {
  logger.info('Starting email test', { smtpServer: config?.smtpServer, port: config?.smtpPort, username: config?.username });
  
  if (!config?.smtpServer || !config?.toEmails) {
    logger.warn('Email test failed: missing config', { smtpServer: config?.smtpServer, toEmails: config?.toEmails });
    return { success: false, message: '请先填写完整的邮箱配置', details: 'SMTP 服务器地址和收件人邮箱为必填项' };
  }

  if (!config.username || !config.password) {
    logger.warn('Email test failed: missing credentials');
    return { success: false, message: '请填写 SMTP 用户名和密码', details: 'QQ 邮箱需使用授权码而非登录密码' };
  }

  try {
    const emailBody =
      `知墟 (ZhiXu ACOP) 告警通知\n` +
      `============================\n\n` +
      `标题: ${testAlert.title}\n` +
      `严重程度: ${testAlert.severity}\n` +
      `描述: ${testAlert.message}\n` +
      `时间: ${new Date(testAlert.timestamp).toLocaleString('zh-CN')}\n` +
      `规则ID: ${testAlert.ruleId}\n\n` +
      `---\n` +
      `请登录 知墟 控制台查看详情。`;

    const dataBlock =
      `From: ${config.username}\r\n` +
      `To: ${config.toEmails}\r\n` +
      `Subject: =?UTF-8?B?${Buffer.from(`[${testAlert.severity.toUpperCase()}] 知墟 Alert: ${testAlert.title}`).toString('base64')}?=\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/plain; charset=utf-8\r\n` +
      `Content-Transfer-Encoding: 8bit\r\n` +
      `\r\n` +
      `${emailBody}\r\n.\r\n`;

    const port = config.smtpPort || 587;
    const useSSL = port === 465;

    let tls: any;
    let net: any;

    try {
      tls = await import('node:tls');
      net = await import('node:net');
    } catch {
      return {
        success: false,
        message: '运行环境不支持原生邮件发送',
        details: '请使用 Node.js 环境运行或改用 Webhook 通道',
      };
    }

    return await new Promise<TestResult>((resolve) => {
      const timeoutId = setTimeout(() => {
        try {
          mainSocket.destroy();
        } catch {}
        resolve({
          success: false,
          message: 'SMTP 连接超时',
          details: `连接 ${config.smtpServer}:${port} 超时（15秒），请检查服务器地址、端口和网络`,
        });
      }, 15000);

      let responseBuffer = '';
      let step = 0;
      let mainSocket: any = null;

      const finish = (success: boolean, message: string, details?: string) => {
        clearTimeout(timeoutId);
        try {
          mainSocket?.destroy();
        } catch {}
        logger.info('Email test finished', { success, message, details, step });
        resolve({ success, message, details });
      };

      const handleServerResponse = (socket: any, data: any) => {
        const text = data.toString();
        responseBuffer += text;
        logger.info('Received SMTP response', { text: text.trim().slice(0, 200), step });
        const lines = text.split('\r\n').filter((l: string) => l.length > 0);

        for (const line of lines) {
          if (!/^\d{3}/.test(line) && line.length > 0) continue;

          const code = line.substring(0, 3);
          const isLast = line.charAt(3) !== '-';

          if (!isLast) continue;

          if (code === '220') {
            if (step === 0) {
              step = 1;
              socket.write('EHLO zhixu\r\n');
            } else if (step === 2) {
              step = 3;
              const tlsSocket = tls.connect(
                { socket: socket, servername: config.smtpServer, rejectUnauthorized: false },
                () => {
                  step = 4;
                  tlsSocket.write('EHLO zhixu\r\n');
                },
              );
              tlsSocket.on('data', (d: any) => handleServerResponse(tlsSocket, d));
              tlsSocket.on('error', (err: any) => {
                finish(false, 'TLS 升级失败，请检查端口配置', err.message);
              });
              mainSocket = tlsSocket;
            }
          } else if (code === '250') {
            if (step === 1) {
              if (useSSL) {
                const authStr = Buffer.from(`${config.username}\u0000${config.username}\u0000${config.password}`).toString('base64');
                step = 5;
                socket.write(`AUTH PLAIN ${authStr}\r\n`);
              } else {
                step = 2;
                socket.write('STARTTLS\r\n');
              }
            } else if (step === 4) {
              const authStr = Buffer.from(`${config.username}\u0000${config.username}\u0000${config.password}`).toString('base64');
              step = 5;
              socket.write(`AUTH PLAIN ${authStr}\r\n`);
            } else if (step === 5) {
              step = 6;
              socket.write(`MAIL FROM:<${config.username}>\r\n`);
            } else if (step === 6) {
              step = 7;
              const recipients = config.toEmails.split(',').map((e: string) => e.trim());
              socket.write(`RCPT TO:<${recipients[0]}>\r\n`);
            } else if (step === 7) {
              const recipients = config.toEmails.split(',').map((e: string) => e.trim());
              if (recipients.length > 1) {
                const next = recipients.shift()!;
                if (recipients.length > 0) {
                  socket.write(`RCPT TO:<${recipients[0]}>\r\n`);
                } else {
                  step = 8;
                  socket.write('DATA\r\n');
                }
              } else {
                step = 8;
                socket.write('DATA\r\n');
              }
            } else if (step === 8) {
              step = 9;
              socket.write(dataBlock);
            } else if (step === 9) {
              finish(true, '已成功发送');
              return;
            }
          } else if (code === '235') {
            step = 5;
            if (useSSL) {
              step = 6;
              socket.write(`MAIL FROM:<${config.username}>\r\n`);
            }
          } else if (code === '334') {
            const authStr = Buffer.from(`${config.username}\u0000${config.username}\u0000${config.password}`).toString('base64');
            step = 5;
            socket.write(`${authStr}\r\n`);
          } else if (code === '354') {
            step = 9;
            socket.write(dataBlock);
          } else if (code.startsWith('5') || code.startsWith('4')) {
            let detailMsg = responseBuffer.slice(-300);
            let userMsg = '测试邮件发送失败';
            if (line.includes('authentication') || line.includes('login') || line.includes('Authentication') || code === '535' || code === '530') {
              userMsg = 'SMTP 认证失败';
              detailMsg = '请检查用户名和密码（授权码）是否正确。\nQQ/163 邮箱需要使用"授权码"而非登录密码，可在邮箱设置 → POP3/SMTP 中生成。';
            } else if (line.includes('relay') || line.includes('Recipient') || code === '550' || code === '553') {
              userMsg = '收件人邮箱不被接受';
              detailMsg = '请检查收件人邮箱地址是否正确，或发件人域名是否被限制。';
            } else if (line.includes('connection') || line.includes('timed out') || line.includes('refused')) {
              userMsg = '无法连接到 SMTP 服务器';
              detailMsg = '请检查 SMTP 服务器地址和端口是否正确，以及网络是否可达。';
            }
            finish(false, userMsg, detailMsg);
            return;
          } else {
            if (step === 1) {
              if (useSSL) {
                const authStr = Buffer.from(`${config.username}\u0000${config.username}\u0000${config.password}`).toString('base64');
                step = 5;
                socket.write(`AUTH PLAIN ${authStr}\r\n`);
              } else {
                step = 2;
                socket.write('STARTTLS\r\n');
              }
            }
          }
        }
      };

      try {
        if (useSSL) {
          logger.info('Connecting via SSL', { host: config.smtpServer, port });
          mainSocket = tls.connect(
            { host: config.smtpServer, port: port, servername: config.smtpServer, rejectUnauthorized: false },
            () => {
              logger.info('SSL connection established');
              step = 1;
              mainSocket.write('EHLO zhixu\r\n');
            },
          );
        } else {
          logger.info('Connecting via plain TCP', { host: config.smtpServer, port });
          mainSocket = net.connect({ host: config.smtpServer, port: port });
        }

        mainSocket.on('data', (d: any) => handleServerResponse(mainSocket, d));

        mainSocket.on('error', (err: any) => {
          logger.error('SMTP socket error', { error: err.message, code: err.code });
          let msg = '无法连接到 SMTP 服务器';
          let detail = err.message || responseBuffer.slice(-200);
          if (err.code === 'ECONNREFUSED') {
            msg = 'SMTP 服务器拒绝连接';
            detail = `请确认 ${config.smtpServer}:${port} 是否正确，以及端口是否开放。\nQQ 邮箱常用端口：465（SSL）或 587（STARTTLS）`;
          } else if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
            msg = 'SMTP 服务器域名无法解析';
            detail = `域名 ${config.smtpServer} 无法解析，请检查拼写或网络 DNS 配置。`;
          } else if (err.code === 'ETIMEDOUT') {
            msg = 'SMTP 服务器连接超时';
            detail = '请检查服务器地址、端口号和网络连通性';
          }
          finish(false, msg, detail);
        });
      } catch (err: any) {
        logger.error('Failed to create SMTP connection', { error: err.message });
        finish(false, '发送测试邮件时发生错误', err.message);
      }
    });
  } catch (error) {
    logger.error('Email test exception', { error: String(error) });
    return {
      success: false,
      message: '发送测试邮件失败',
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testWebhook(config: WebhookConfig): Promise<TestResult> {
  if (!config?.url) {
    return { success: false, message: '请先填写 Webhook 地址' };
  }

  try {
    const payload = {
      alert: testAlert,
      source: 'zhixu',
      timestamp: Date.now(),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(config.headers || {}),
    };

    if (config.secret) {
      const encoder = new TextEncoder();
      const data = encoder.encode(JSON.stringify(payload));
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(config.secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
      const sigArray = Array.from(new Uint8Array(signature));
      const sigHex = sigArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      headers['X-Signature'] = `sha256=${sigHex}`;
    }

    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();

    if (response.ok) {
      return {
        success: true,
        message: 'Webhook 测试请求发送成功',
        details: `HTTP ${response.status} ${response.statusText}`,
      };
    } else {
      return {
        success: false,
        message: 'Webhook 测试请求失败',
        details: `HTTP ${response.status} ${response.statusText}: ${responseText.slice(0, 200)}`,
      };
    }
  } catch (error) {
    logger.error('Webhook test failed', { error: String(error) });
    return {
      success: false,
      message: 'Webhook 测试请求失败',
      details: error instanceof Error ? error.message : String(error),
    };
  }
}
