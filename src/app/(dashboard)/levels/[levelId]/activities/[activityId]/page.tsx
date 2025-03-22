import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import QuizActivity from "@/components/activities/QuizActivity";
import LabActivity from "@/components/activities/LabActivity";
import ReadingActivity from "@/components/activities/ReadingActivity";

export default async function ActivityPage({ params }: { 
  params: { levelId: string; activityId: string } 
}) {
  const { userId } = await auth();
  
  if (!userId) {
    redirect("/sign-in");
  }
  
  // Get activity data
  const activity = await db.activity.findUnique({
    where: {
      id: parseInt(params.activityId)
    }
  });
  
  if (!activity) {
    redirect(`/levels/${params.levelId}`);
  }
  
  // Get level data
  const level = await db.level.findUnique({
    where: {
      id: parseInt(params.levelId)
    }
  });
  
  if (!level) {
    redirect("/levels");
  }
  
  // Get activity progress
  const activityProgress = await db.activityProgress.findUnique({
    where: {
      userId_activityId: {
        userId,
        activityId: parseInt(params.activityId)
      }
    }
  });
  
  // Check if activity is unlocked
  // For simplicity, we'll consider it unlocked if it exists in this level
  const isUnlocked = activity.levelId === parseInt(params.levelId);
  
  if (!isUnlocked) {
    redirect(`/levels/${params.levelId}`);
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link 
          href={`/levels/${params.levelId}`} 
          className="text-gray-400 hover:text-white flex items-center"
        >
          <ChevronLeft className="h-5 w-5 mr-1" />
          Back to Level {level.order}
        </Link>
      </div>
      
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{activity.name}</h1>
        <p className="text-gray-400 mt-2">{activity.description}</p>
      </div>
      
      <Card className="p-6 bg-black/30 border-green-500/20">
        {/* Render the appropriate activity component based on type */}
        {activity.type === 'QUIZ' && (
          <QuizActivity 
            activity={activity} 
            userId={userId} 
            progress={activityProgress}
          />
        )}
        
        {activity.type === 'READING' && (
          <ReadingActivity 
            activity={activity} 
            userId={userId} 
            progress={activityProgress}
          />
        )}
        
        {activity.type === 'LAB' && (
          <LabActivity 
            activity={activity} 
            userId={userId} 
            progress={activityProgress}
          />
        )}
        
        {!['QUIZ', 'READING', 'LAB'].includes(activity.type) && (
          <div className="text-center py-8">
            <h3 className="text-xl font-semibold mb-4">
              Activity Type Not Implemented Yet
            </h3>
            <p className="text-gray-400 mb-6">
              This type of activity ({activity.type}) is not available yet.
            </p>
            <Button asChild>
              <Link href={`/levels/${params.levelId}`}>
                Return to Level
              </Link>
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
} 