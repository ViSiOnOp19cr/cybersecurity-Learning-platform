"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, AlertCircle, CheckCircle, Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import Image from "next/image";
import { motion } from "framer-motion";

interface ScenarioSolution {
  id: string;
  text: string;
  correct: boolean;
}

interface Scenario {
  id: string;
  title: string;
  description: string;
  image: string;
  question: string;
  options: string[];
  correctAnswer: string | string[];
  explanation: string;
  solutions: ScenarioSolution[];
}

interface SecurityDetectiveLabProps {
  activity: any;
  userId: string;
  progress: any;
}

export default function SecurityDetectiveLab({ activity, userId, progress }: SecurityDetectiveLabProps) {
  const router = useRouter();
  const [isCompleted, setIsCompleted] = useState(progress?.isCompleted || false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string | string[]>>({});
  const [selectedSolutions, setSelectedSolutions] = useState<Record<string, string>>({});
  const [showResults, setShowResults] = useState<Record<string, boolean>>({});
  const [securityScore, setSecurityScore] = useState(0);
  const [scenariosCompleted, setScenariosCompleted] = useState(0);
  
  // Parse content
  const content = typeof activity.content === 'string'
    ? JSON.parse(activity.content)
    : activity.content;
  
  const scenarios: Scenario[] = content.scenarios || [];
  const currentScenario = scenarios[currentScenarioIndex];
  
  useEffect(() => {
    // Initialize state from progress if available
    if (progress?.answers) {
      try {
        const savedAnswers = typeof progress.answers === 'string'
          ? JSON.parse(progress.answers)
          : progress.answers;
        
        if (savedAnswers.userAnswers) {
          setUserAnswers(savedAnswers.userAnswers);
        }
        
        if (savedAnswers.selectedSolutions) {
          setSelectedSolutions(savedAnswers.selectedSolutions);
        }
        
        // Calculate scenarios completed
        const completedCount = Object.keys(savedAnswers.userAnswers || {}).length;
        setScenariosCompleted(completedCount);
        
        // Calculate security score
        calculateSecurityScore(savedAnswers.userAnswers || {});
      } catch (error) {
        console.error("Error parsing saved answers:", error);
      }
    }
  }, [progress]);
  
  const calculateSecurityScore = (answers: Record<string, string | string[]>) => {
    let correctCount = 0;
    
    scenarios.forEach(scenario => {
      const userAnswer = answers[scenario.id];
      
      if (Array.isArray(scenario.correctAnswer) && Array.isArray(userAnswer)) {
        // For multi-select questions, check if arrays match (regardless of order)
        const isCorrect = scenario.correctAnswer.length === userAnswer.length &&
          scenario.correctAnswer.every(answer => userAnswer.includes(answer));
        
        if (isCorrect) correctCount++;
      } else if (!Array.isArray(scenario.correctAnswer) && !Array.isArray(userAnswer)) {
        // For single select questions
        if (userAnswer === scenario.correctAnswer) correctCount++;
      }
    });
    
    const score = Math.round((correctCount / scenarios.length) * 100);
    setSecurityScore(score);
    return score;
  };
  
  const handleNext = () => {
    if (currentScenarioIndex < scenarios.length - 1) {
      setCurrentScenarioIndex(currentScenarioIndex + 1);
    }
  };
  
  const handlePrevious = () => {
    if (currentScenarioIndex > 0) {
      setCurrentScenarioIndex(currentScenarioIndex - 1);
    }
  };
  
  const handleSelectOption = (scenarioId: string, option: string) => {
    // Check if the current scenario allows multiple answers
    const scenario = scenarios.find(s => s.id === scenarioId);
    const isMultiSelect = Array.isArray(scenario?.correctAnswer);
    
    if (isMultiSelect) {
      // Handle multi-select
      const currentSelections = Array.isArray(userAnswers[scenarioId]) 
        ? [...userAnswers[scenarioId] as string[]] 
        : [];
      
      if (currentSelections.includes(option)) {
        // If already selected, remove it
        setUserAnswers({
          ...userAnswers,
          [scenarioId]: currentSelections.filter(item => item !== option)
        });
      } else {
        // If not selected, add it
        setUserAnswers({
          ...userAnswers,
          [scenarioId]: [...currentSelections, option]
        });
      }
    } else {
      // Handle single-select
      setUserAnswers({
        ...userAnswers,
        [scenarioId]: option
      });
    }
    
    // If this is a newly answered scenario, increment the count
    if (!userAnswers[scenarioId]) {
      setScenariosCompleted(prev => prev + 1);
    }
  };
  
  const handleSelectSolution = (scenarioId: string, solutionId: string) => {
    setSelectedSolutions({
      ...selectedSolutions,
      [scenarioId]: solutionId
    });
  };
  
  const handleCheckAnswer = (scenarioId: string) => {
    setShowResults({
      ...showResults,
      [scenarioId]: true
    });
    
    // Calculate security score when checking an answer
    calculateSecurityScore(userAnswers);
  };
  
  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      
      const finalScore = calculateSecurityScore(userAnswers);
      const pointsEarned = Math.round((finalScore / 100) * activity.points);
      
      // Prepare answers object to save
      const answersToSave = {
        userAnswers,
        selectedSolutions,
      };
      
      // Update activity progress in the database
      const response = await fetch(`/api/activities/${activity.id}/progress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isCompleted: true,
          score: finalScore,
          pointsEarned,
          answers: answersToSave
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to update progress");
      }
      
      setIsCompleted(true);
      
      // Refresh the page data
      router.refresh();
    } catch (error) {
      console.error("Error submitting lab:", error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Add new function to reset the lab state for reattempt
  const handleReattempt = async () => {
    try {
      // Reset the progress on the server
      const response = await fetch(`/api/activities/${activity.id}/progress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isCompleted: false,
          score: 0,
          pointsEarned: 0,
          answers: {}
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to reset progress");
      }
      
      // Reset all state to initial values
      setUserAnswers({});
      setSelectedSolutions({});
      setShowResults({});
      setScenariosCompleted(0);
      setSecurityScore(0);
      setCurrentScenarioIndex(0);
      setIsCompleted(false);
      
      // Refresh the page data
      router.refresh();
    } catch (error) {
      console.error("Error resetting lab:", error);
    }
  };
  
  // If already completed, show the completion summary
  if (isCompleted) {
    return (
      <div className="text-center py-6 space-y-6">
        <div className="mb-4">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
        </div>
        
        <h2 className="text-2xl font-bold mb-2 text-white">Investigation Complete!</h2>
        <p className="text-white mb-4">You've successfully completed the Security Detective lab.</p>
        
        <div className="max-w-md mx-auto bg-black/30 p-4 rounded-lg border border-green-500/20 mb-6">
          <h3 className="text-lg font-semibold mb-2 text-white">Your Security Score</h3>
          <div className="relative h-6 w-full bg-gray-800 rounded-full mb-2">
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full"
              style={{ width: `${securityScore}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-white">
              {securityScore}%
            </span>
          </div>
          <p className="text-sm text-gray-400">Correctly identified {Math.round((securityScore / 100) * scenarios.length)} of {scenarios.length} security issues</p>
        </div>
        
        <div className="flex justify-center space-x-4">
          <Button variant="outline" onClick={() => setIsCompleted(false)}>
            Review Investigation
          </Button>
          <Button variant="secondary" onClick={handleReattempt}>
            Reattempt Lab
          </Button>
          <Button asChild>
            <a href={`/levels/${activity.levelId}`}>
              Return to Level
            </a>
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-400">Security Investigation Progress</span>
          <span className="text-sm font-medium text-white">{scenariosCompleted} of {scenarios.length} scenarios analyzed</span>
        </div>
        <Progress value={(scenariosCompleted / scenarios.length) * 100} className="h-2" />
      </div>
      
      {/* Scenario Card */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Scenario Image */}
        <div className="md:col-span-1">
          <Card className="h-full bg-black/20 border-blue-500/20 overflow-hidden">
            <div className="relative h-48 md:h-full min-h-[200px] bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
              {currentScenario.image ? (
                <div className="relative h-full w-full">
                  <Image 
                    src={currentScenario.image}
                    alt={currentScenario.title}
                    fill
                    style={{ objectFit: 'contain' }}
                    className="p-4"
                  />
                </div>
              ) : (
                <Info className="h-16 w-16 text-blue-500/50" />
              )}
            </div>
            <CardFooter className="p-3">
              <div className="flex items-center justify-between w-full">
                <Badge variant="outline" className="bg-blue-950/30">
                  Scenario {currentScenarioIndex + 1}/{scenarios.length}
                </Badge>
                {userAnswers[currentScenario.id] && (
                  <Badge 
                    className={
                      showResults[currentScenario.id] 
                        ? (
                          Array.isArray(currentScenario.correctAnswer)
                            ? JSON.stringify(userAnswers[currentScenario.id]) === JSON.stringify(currentScenario.correctAnswer)
                              ? "bg-green-900/30 text-green-300 hover:bg-green-900/30"
                              : "bg-red-900/30 text-red-300 hover:bg-red-900/30"
                            : userAnswers[currentScenario.id] === currentScenario.correctAnswer
                              ? "bg-green-900/30 text-green-300 hover:bg-green-900/30"
                              : "bg-red-900/30 text-red-300 hover:bg-red-900/30"
                        )
                        : "bg-blue-900/30 text-blue-300 hover:bg-blue-900/30"
                    }
                  >
                    {showResults[currentScenario.id] 
                      ? (
                        Array.isArray(currentScenario.correctAnswer)
                          ? JSON.stringify(userAnswers[currentScenario.id]) === JSON.stringify(currentScenario.correctAnswer)
                            ? "Correct"
                            : "Incorrect"
                          : userAnswers[currentScenario.id] === currentScenario.correctAnswer
                            ? "Correct"
                            : "Incorrect"
                      )
                      : "Answered"
                    }
                  </Badge>
                )}
              </div>
            </CardFooter>
          </Card>
        </div>
        
        {/* Scenario Content */}
        <Card className="md:col-span-2 h-full bg-black/20 border-blue-500/20">
          <CardHeader>
            <CardTitle className="text-xl text-white">{currentScenario.title}</CardTitle>
            <CardDescription className="text-gray-300">
              {currentScenario.description}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div>
              <h4 className="text-md font-medium mb-3 text-white">{currentScenario.question}</h4>
              
              {/* Single select or multi-select based on scenario */}
              {Array.isArray(currentScenario.correctAnswer) ? (
                <div className="space-y-3">
                  {currentScenario.options.map((option) => (
                    <div key={option} className="flex items-start space-x-2">
                      <Checkbox
                        id={`${currentScenario.id}-${option}`}
                        checked={Array.isArray(userAnswers[currentScenario.id]) && 
                          (userAnswers[currentScenario.id] as string[]).includes(option)}
                        onCheckedChange={() => handleSelectOption(currentScenario.id, option)}
                        disabled={showResults[currentScenario.id]}
                        className="mt-1"
                      />
                      <Label
                        htmlFor={`${currentScenario.id}-${option}`}
                        className="text-white cursor-pointer"
                      >
                        {option}
                      </Label>
                    </div>
                  ))}
                </div>
              ) : (
                <RadioGroup
                  value={userAnswers[currentScenario.id] as string}
                  onValueChange={(value) => handleSelectOption(currentScenario.id, value)}
                  disabled={showResults[currentScenario.id]}
                >
                  {currentScenario.options.map((option) => (
                    <div key={option} className="flex items-center space-x-2">
                      <RadioGroupItem 
                        value={option} 
                        id={`${currentScenario.id}-${option}`} 
                        disabled={showResults[currentScenario.id]}
                      />
                      <Label
                        htmlFor={`${currentScenario.id}-${option}`}
                        className="text-white cursor-pointer"
                      >
                        {option}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            </div>
            
            {/* Explanation (shown after checking answer) */}
            {showResults[currentScenario.id] && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="bg-black/30 p-4 rounded-lg border border-blue-500/20"
              >
                <h4 className="flex items-center text-md font-medium mb-2 text-white">
                  <Info className="h-4 w-4 mr-2 text-blue-400" />
                  Explanation
                </h4>
                <p className="text-gray-300">{currentScenario.explanation}</p>
                
                <div className="mt-4">
                  <h5 className="text-sm font-medium mb-2 text-white">Select the best solution:</h5>
                  <div className="space-y-2">
                    {currentScenario.solutions.map((solution) => (
                      <div 
                        key={solution.id}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedSolutions[currentScenario.id] === solution.id
                            ? solution.correct 
                              ? "bg-green-900/30 border-green-500"
                              : "bg-red-900/30 border-red-500"
                            : selectedSolutions[currentScenario.id] && solution.correct
                              ? "bg-green-900/30 border-green-500"
                              : "bg-transparent border-gray-700 hover:border-blue-500/50"
                        }`}
                        onClick={() => handleSelectSolution(currentScenario.id, solution.id)}
                      >
                        <div className="flex justify-between items-center">
                          <p className="text-white">{solution.text}</p>
                          {selectedSolutions[currentScenario.id] === solution.id && (
                            <Check className={`h-4 w-4 ${solution.correct ? "text-green-400" : "text-red-400"}`} />
                          )}
                          {selectedSolutions[currentScenario.id] && solution.correct && selectedSolutions[currentScenario.id] !== solution.id && (
                            <Check className="h-4 w-4 text-green-400" />
                          )}
                        </div>
                        {selectedSolutions[currentScenario.id] === solution.id && !solution.correct && (
                          <p className="text-red-300 text-sm mt-2">This is not the best solution.</p>
                        )}
                        {selectedSolutions[currentScenario.id] && solution.correct && selectedSolutions[currentScenario.id] !== solution.id && (
                          <p className="text-green-300 text-sm mt-2">This would be the best solution.</p>
                        )}
                        {selectedSolutions[currentScenario.id] === solution.id && solution.correct && (
                          <p className="text-green-300 text-sm mt-2">Correct! This is the best solution.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </CardContent>
          
          <CardFooter className="flex justify-between">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevious}
              disabled={currentScenarioIndex === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
            </Button>
            
            <div className="flex flex-col items-end">
              {showResults[currentScenario.id] && !selectedSolutions[currentScenario.id] && (
                <p className="text-amber-400 text-xs mb-2">Please select a solution before proceeding</p>
              )}
              
              {showResults[currentScenario.id] ? (
                <Button
                  size="sm"
                  onClick={handleNext}
                  disabled={currentScenarioIndex === scenarios.length - 1 || !selectedSolutions[currentScenario.id]}
                >
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => handleCheckAnswer(currentScenario.id)}
                  disabled={!userAnswers[currentScenario.id]}
                >
                  Check Answer
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>
      </div>
      
      {/* Submit Button */}
      <div className="pt-6 flex justify-center">
        <Button
          onClick={handleSubmit}
          disabled={
            isSubmitting || 
            Object.keys(userAnswers).length < scenarios.length || 
            !Object.keys(userAnswers).every(key => showResults[key])
          }
          className="px-6"
        >
          {isSubmitting ? "Submitting..." : "Complete Investigation"}
        </Button>
      </div>
    </div>
  );
} 