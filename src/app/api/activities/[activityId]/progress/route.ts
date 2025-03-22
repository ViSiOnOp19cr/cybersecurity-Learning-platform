import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@clerk/nextjs/server';

export async function POST(
  req: NextRequest,
  { params }: { params: { activityId: string } }
) {
  try {
    const { userId } = await auth();
    
    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    
    let body;
    try {
      body = await req.json();
      console.log("Received request body:", body);
    } catch (error) {
      console.error("Error parsing request body:", error);
      return new NextResponse("Invalid request body", { status: 400 });
    }
    
    const { isCompleted, score, pointsEarned: clientPointsEarned, answers } = body;
    console.log("Extracted data:", { isCompleted, score, clientPointsEarned, answers });
    
    if (isCompleted === undefined) {
      return new NextResponse("Missing required fields", { status: 400 });
    }
    
    let activityId;
    try {
      activityId = parseInt(params.activityId);
      if (isNaN(activityId)) {
        throw new Error(`Invalid activity ID: ${params.activityId}`);
      }
    } catch (error) {
      console.error("Error parsing activity ID:", error);
      return new NextResponse(`Invalid activity ID: ${params.activityId}`, { status: 400 });
    }
    
    // Get the activity to check its point value
    const activity = await db.activity.findUnique({
      where: {
        id: activityId
      }
    });
    
    if (!activity) {
      return new NextResponse("Activity not found", { status: 404 });
    }
    
    // Safe handling of answers
    let parsedAnswers = null;
    if (answers) {
      try {
        // If it's already a string, parse it to validate it's proper JSON
        if (typeof answers === 'string') {
          JSON.parse(answers);
          parsedAnswers = answers;
        } else {
          // If it's an object, stringify it
          parsedAnswers = JSON.stringify(answers);
        }
      } catch (error) {
        console.error("Error processing answers:", error);
        // Continue without answers rather than failing
        parsedAnswers = null;
      }
    }
    
    // Calculate points earned based on score percentage if not provided by client
    const pointsEarned = clientPointsEarned || (score ? Math.round((score / 100) * activity.points) : 0);
    
    try {
      // Find or create user progress for the level first
      let userProgress = await db.userProgress.findUnique({
        where: {
          userId_levelId: {
            userId,
            levelId: activity.levelId
          }
        }
      });
      
      if (!userProgress) {
        // Create user progress record if it doesn't exist
        userProgress = await db.userProgress.create({
          data: {
            userId,
            levelId: activity.levelId,
            activitiesCompleted: 0,
            pointsEarned: 0,
            isCompleted: false
          }
        });
      }

      // Find existing activity progress
      const existingProgress = await db.activityProgress.findUnique({
        where: {
          userId_activityId: {
            userId,
            activityId
          }
        }
      });
      
      // Update or create activity progress
      if (existingProgress) {
        // Only update if the new score is better or if it wasn't completed before
        if (!existingProgress.isCompleted || pointsEarned > existingProgress.pointsEarned) {
          await db.activityProgress.update({
            where: {
              userId_activityId: {
                userId,
                activityId
              }
            },
            data: {
              isCompleted,
              pointsEarned,
              attempts: existingProgress.attempts + 1,
              answers: parsedAnswers === null ? undefined : parsedAnswers,
              completedAt: isCompleted ? new Date() : existingProgress.completedAt
            }
          });
        } else {
          // Just increment attempts if not improving score
          await db.activityProgress.update({
            where: {
              userId_activityId: {
                userId,
                activityId
              }
            },
            data: {
              attempts: existingProgress.attempts + 1
            }
          });
        }
      } else {
        // Create new activity progress with required relations
        await db.activityProgress.create({
          data: {
            userId,
            activityId,
            progressId: userProgress.id,  // Set the progressId field directly
            isCompleted,
            pointsEarned,
            attempts: 1,
            answers: parsedAnswers === null ? undefined : parsedAnswers,
            completedAt: isCompleted ? new Date() : null
          }
        });
      }
      
      // Update user's total points when activity is completed
      if (isCompleted) {
        // Get the user to update their total points
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { totalPoints: true }
        });
        
        if (user) {
          // Calculate the points to add
          let pointsToAdd = pointsEarned;
          
          // If updating an existing activity, only add the difference
          if (existingProgress && existingProgress.isCompleted) {
            pointsToAdd = Math.max(0, pointsEarned - existingProgress.pointsEarned);
          }
          
          // Update the user's total points
          if (pointsToAdd > 0) {
            console.log(`Updating user ${userId} points: ${user.totalPoints} + ${pointsToAdd} = ${user.totalPoints + pointsToAdd}`);
            await db.user.update({
              where: { id: userId },
              data: {
                totalPoints: user.totalPoints + pointsToAdd
              }
            });
          }
        }
      }
      
      // Update level progress
      if (isCompleted) {
        // Get all completed activities for this level
        const completedActivities = await db.activityProgress.findMany({
          where: {
            userId,
            activity: {
              levelId: activity.levelId
            },
            isCompleted: true
          }
        });
        
        // Calculate total points earned in this level
        const totalPointsEarned = completedActivities.reduce(
          (sum: number, progress: { pointsEarned: number }) => sum + progress.pointsEarned, 
          0
        );
        
        // Get the level to check if it's completed
        const level = await db.level.findUnique({
          where: {
            id: activity.levelId
          }
        });
        
        if (level) {
          // Check if level is completed (enough points to pass)
          const isLevelCompleted = totalPointsEarned >= level.minPointsToPass;
          
          // Update user progress for this level
          await db.userProgress.update({
            where: {
              userId_levelId: {
                userId,
                levelId: level.id
              }
            },
            data: {
              activitiesCompleted: completedActivities.length,
              pointsEarned: totalPointsEarned,
              isCompleted: isLevelCompleted,
              completedAt: isLevelCompleted ? new Date() : null
            }
          });
          
          // If level is completed, update the user's currentLevel if this is their current level
          if (isLevelCompleted) {
            const user = await db.user.findUnique({
              where: { id: userId },
              select: { currentLevel: true, totalPoints: true }
            });
            
            if (user && user.currentLevel === level.order) {
              // Update user's current level to the next level, but don't add points again
              await db.user.update({
                where: { id: userId },
                data: {
                  currentLevel: level.order + 1
                }
              });
            }
            // We no longer need to update total points here since we do it directly when activities are completed
          }
          
          // Handle achievements
          if (isLevelCompleted) {
            // Check for "Level Master" achievement
            const levelMasterAchievement = await db.achievement.findFirst({
              where: {
                type: "LEVEL_COMPLETION",
                levelId: level.id
              }
            });
            
            if (levelMasterAchievement) {
              // Award the achievement if not already awarded
              await db.userAchievement.upsert({
                where: {
                  userId_achievementId: {
                    userId,
                    achievementId: levelMasterAchievement.id
                  }
                },
                update: {},
                create: {
                  userId,
                  achievementId: levelMasterAchievement.id,
                  earnedAt: new Date()
                }
              });
            }
          }
          
          // Check for perfect quiz achievement
          if (activity.type === "QUIZ" && pointsEarned === activity.points) {
            const perfectQuizAchievement = await db.achievement.findFirst({
              where: {
                type: "PERFECT_QUIZ"
              }
            });
            
            if (perfectQuizAchievement) {
              // Award the achievement if not already awarded
              await db.userAchievement.upsert({
                where: {
                  userId_achievementId: {
                    userId,
                    achievementId: perfectQuizAchievement.id
                  }
                },
                update: {},
                create: {
                  userId,
                  achievementId: perfectQuizAchievement.id,
                  earnedAt: new Date()
                }
              });
            }
          }
        }
      }
      
      return NextResponse.json({
        success: true,
        isCompleted,
        pointsEarned
      });
    } catch (dbError: any) {
      console.error("Database operation error:", dbError);
      return new NextResponse(`Database error: ${dbError.message}`, { status: 500 });
    }
  } catch (error: any) {
    console.error("[ACTIVITY_PROGRESS]", error);
    return new NextResponse(`Internal Error: ${error.message}`, { status: 500 });
  }
}