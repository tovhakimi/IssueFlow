import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('ticket_dependencies')
export class TicketDependency {
  @PrimaryGeneratedColumn()
  id: number;

  // The ticket that is blocked
  @Column()
  ticketId: number;

  // The ticket that is blocking
  @Column()
  blockedById: number;
}
