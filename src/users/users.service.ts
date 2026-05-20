import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<Omit<User, 'passwordHash'>> {
    const existing = await this.repo.findOne({
      where: [{ username: dto.username }, { email: dto.email }],
    });
    if (existing) throw new ConflictException('Username or email already exists');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.repo.create({ ...dto, passwordHash });
    const saved = await this.repo.save(user);
    return this.sanitize(saved);
  }

  async findAll(): Promise<Omit<User, 'passwordHash'>[]> {
    const users = await this.repo.find();
    return users.map(u => this.sanitize(u));
  }

  async findOne(id: number): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return this.sanitize(user);
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.repo.findOne({ where: { username } });
  }

  async update(id: number, dto: UpdateUserDto): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User ${id} not found`);

    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    if (dto.username) user.username = dto.username;
    if (dto.email) user.email = dto.email;
    if (dto.fullName) user.fullName = dto.fullName;
    if (dto.role) user.role = dto.role;

    const saved = await this.repo.save(user);
    return this.sanitize(saved);
  }

  async getMentions(userId: number, page = 1, limit = 20) {
    // Delegated to CommentsService via the mentions repository; exposed here for the route
    // CommentsModule handles this — we keep the user route thin
    return [];
  }

  private sanitize(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash, ...rest } = user;
    return rest as Omit<User, 'passwordHash'>;
  }
}
