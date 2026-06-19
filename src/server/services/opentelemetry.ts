import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { api } from '@opentelemetry/api';

// 配置 OpenTelemetry SDK
const resource = new Resource({
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'zhixu-server',
  [ATTR_SERVICE_VERSION]: '1.0.0',
  'deployment.environment': process.env.NODE_ENV || 'development',
});

// 创建 SDK 实例
const sdk = new NodeSDK({
  resource,
  spanProcessor: new SimpleSpanProcessor(new ConsoleSpanExporter()),
  // 启用日志导出（可选）
  // logRecordExporter: new OTLPLogExporter({
  //   url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/logs`,
  // }),
});

// 初始化 SDK
async function initOpenTelemetry(): Promise<void> {
  try {
    sdk.start();
    console.log('OpenTelemetry initialized successfully');
  } catch (error) {
    console.error('Error initializing OpenTelemetry:', error);
  }
}

// 关闭 SDK
async function shutdownOpenTelemetry(): Promise<void> {
  try {
    await sdk.shutdown();
    console.log('OpenTelemetry shut down successfully');
  } catch (error) {
    console.error('Error shutting down OpenTelemetry:', error);
  }
}

// 导出 tracer
export const tracer = api.trace.getTracer('zhixu-tracer', '1.0.0');

// 创建 span
export function createSpan(name: string, fn: () => Promise<void>): Promise<void> {
  return tracer.startActiveSpan(name, async (span) => {
    try {
      await fn();
      span.setStatus({ code: api.SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({
        code: api.SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      span.end();
    }
  });
}

export { initOpenTelemetry, shutdownOpenTelemetry };

export default sdk;
