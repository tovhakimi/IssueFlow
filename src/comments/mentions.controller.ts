import { Controller, Get, Param, ParseIntPipe, HttpCode, Query } from '@nestjs/common';
import { CommentsService } from './comments.service';

// This controller lives in CommentsModule but owns GET /users/:userId/mentions
@Controller('users')
export class MentionsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get(':userId/mentions')
  @HttpCode(200)
  getMentions(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.commentsService.findMentionsByUser(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
