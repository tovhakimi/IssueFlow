import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Comment } from './comment.entity';
import { User } from '../users/user.entity';

@Entity('mentions')
export class Mention {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  commentId: number;

  @ManyToOne(() => Comment, (comment) => comment.mentions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'commentId' })
  comment: Comment;

  @Column()
  userId: number;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
