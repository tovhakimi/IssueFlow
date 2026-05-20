import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ticketId: number;

  @Column()
  filename: string;

  @Column()
  originalName: string;

  @Column()
  contentType: string;

  @Column()
  path: string;

  @Column()
  size: number;

  @CreateDateColumn()
  createdAt: Date;
}
