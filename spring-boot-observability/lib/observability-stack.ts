import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class ObservabilityStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ============================================
    // 1. VPC
    // ============================================
    const vpc = new ec2.Vpc(this, 'ObservabilityVPC', {
      maxAzs: 2,
      natGateways: 1,
    });

    // ============================================
    // 2. ECS Cluster
    // ============================================
    const cluster = new ecs.Cluster(this, 'SpringBootCluster', {
      vpc,
      containerInsights: true,
    });

    // ============================================
    // 3. CloudWatch Log Group
    // ============================================
    const appLogGroup = new logs.LogGroup(this, 'SpringBootAppLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ============================================
    // 4. ECS Fargate Service with ALB
    // ============================================
    const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, 'SpringBootService', {
      cluster,
      desiredCount: 1,
      cpu: 256,
      memoryLimitMiB: 512,
      publicLoadBalancer: true,
      listenerPort: 80,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry('041639255744.dkr.ecr.us-east-1.amazonaws.com/spring-boot-observability:latest'),
        containerPort: 8080,
        environment: {
          'SPRING_PROFILES_ACTIVE': 'prod',
        },
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: 'spring-boot',
          logGroup: appLogGroup,
        }),
      },
    });

    // ============================================
    // 5. Task Role permissions (if needed)
    // ============================================
    fargateService.taskDefinition.taskRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchReadOnlyAccess')
    );

    // ============================================
    // 6. Configure ALB Health Check for Spring Boot
    // ============================================
    fargateService.targetGroup.configureHealthCheck({
      path: '/actuator/health',
      port: '8080',
      healthyHttpCodes: '200',
      interval: cdk.Duration.seconds(15),
      timeout: cdk.Duration.seconds(5),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 3,
    });

    // Output the Load Balancer DNS
    new cdk.CfnOutput(this, 'LoadBalancerDNS', {
      value: fargateService.loadBalancer.loadBalancerDnsName,
    });
  }
}
