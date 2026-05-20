import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum AuditActor {
  USER = 'USER',
  SYSTEM = 'SYSTEM',
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: AuditActor })
  actor: AuditActor;

  @Column()
  action: string;

  @Column()
  entityType: string;

  @Column()
  entityId: number;

  @Column({ nullable: true })
  performedBy: number;

  @Column({ type: 'jsonb', nullable: true })
  changes: Record<string, any>;

  @CreateDateColumn()
  timestamp: Date;
}
