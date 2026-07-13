import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, Users, Zap, Shield, BarChart3, Brain } from 'lucide-react';

export function PresentationSlides() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlay, setIsAutoPlay] = useState(true);

  const slides = [
    {
      id: 1,
      title: 'NetSentinel',
      subtitle: 'Supervision Sécurité Simplifiée',
      description: "Plateforme SOC légère et performante pour la gestion des logs, la détection des menaces et le déploiement d'agents.",
      icon: Shield,
      background: 'from-primary/20 via-background to-background',
    },
    {
      id: 2,
      title: 'Intégration Elasticsearch',
      subtitle: 'Gestion centralisée des logs',
      description: "Connectez vos sources de données à Elasticsearch pour une indexation et une recherche ultra-rapides en temps réel.",
      icon: BarChart3,
      background: 'from-primary/20 to-primary/5',
    },
    {
      id: 3,
      title: 'Agents Distribués',
      subtitle: 'Déploiement facile et gestion unifiée',
      description: 'Déployez des agents légers sur vos serveurs pour collecter, transformer et envoyer les données vers le cœur du système.',
      icon: Users,
      background: 'from-primary/10 via-accent/10 to-background',
    },
    {
      id: 4,
      title: 'Dashboard Avancé',
      subtitle: 'Visualisation et analyse en temps réel',
      description: 'Tableaux de bord intuitifs, métriques en direct et alertes pour une supervision complète de vos infrastructure.',
      icon: Zap,
      background: 'from-primary/15 to-background',
    },
    {
      id: 5,
      title: 'Détection IA',
      subtitle: 'Menaces détectées automatiquement',
      description: "Moteur de détection alimenté par l'IA pour identifier les anomalies et les menaces en temps réel sans faux positifs.",
      icon: Brain,
      background: 'from-primary/20 via-background to-accent/5',
    },
    {
      id: 6,
      title: 'Prêt à démarrer',
      subtitle: 'Commencez maintenant',
      description: 'Configurez NetSentinel en quelques minutes et supervisez votre infrastructure en toute sécurité.',
      icon: Lock,
      background: 'from-primary/20 to-primary/10',
    },
  ];

  useEffect(() => {
    if (!isAutoPlay) return undefined;

    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [isAutoPlay, slides.length]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'ArrowRight') {
        setCurrentSlide((prev) => (prev + 1) % slides.length);
        setIsAutoPlay(false);
      }
      if (e.key === 'ArrowLeft') {
        setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
        setIsAutoPlay(false);
      }
      if (e.key === ' ') {
        e.preventDefault();
        setIsAutoPlay((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [slides.length]);

  const goToSlide = (index) => {
    setCurrentSlide(index);
    setIsAutoPlay(false);
  };

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
    setIsAutoPlay(false);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
    setIsAutoPlay(false);
  };

  const Slide = slides[currentSlide];
  const IconComponent = Slide.icon;

  return (
    <div className="w-full max-w-4xl">
      <div
        className={`bg-gradient-to-br ${Slide.background} border border-border rounded-2xl shadow-2xl p-8 md:p-16 relative overflow-hidden transition-all duration-500 min-h-96 md:min-h-[500px] flex flex-col justify-center items-center text-center`}
      >
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl -z-10" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-accent/5 rounded-full blur-3xl -z-10" />

        <div className="mb-6 inline-flex p-4 rounded-full bg-primary/10 border border-primary/30">
          <IconComponent className="w-12 h-12 md:w-16 md:h-16 text-primary" />
        </div>

        <div className="inline-block mb-4 px-3 py-1 rounded-full bg-primary/20 border border-primary/30">
          <p className="text-xs md:text-sm font-semibold text-primary">
            {String(currentSlide + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
          </p>
        </div>

        <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-foreground mb-3 leading-tight">
          {Slide.title}
        </h1>

        <h2 className="text-lg md:text-2xl text-primary font-semibold mb-4">
          {Slide.subtitle}
        </h2>

        <p className="text-base md:text-lg text-foreground/70 max-w-2xl leading-relaxed">
          {Slide.description}
        </p>
      </div>

      <div className="flex justify-center gap-2 mt-8">
        {slides.map((_, index) => (
          <button
            key={index}
            onClick={() => goToSlide(index)}
            className={`transition-all duration-300 ${
              index === currentSlide
                ? 'bg-primary w-8 h-3'
                : 'bg-border hover:bg-border/70 w-2 h-2'
            } rounded-full`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      <div className="flex justify-between items-center mt-8">
        <button
          onClick={prevSlide}
          className="flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full bg-card border border-border hover:border-primary hover:bg-primary/5 text-foreground transition-all duration-300 group"
          aria-label="Previous slide"
        >
          <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 group-hover:text-primary" />
        </button>

        <button
          onClick={() => setIsAutoPlay((prev) => !prev)}
          className={`px-4 md:px-6 py-2 rounded-full font-medium transition-all duration-300 text-sm md:text-base ${
            isAutoPlay
              ? 'bg-primary text-white'
              : 'bg-card border border-border text-foreground hover:bg-primary/10'
          }`}
        >
          {isAutoPlay ? 'En lecture' : 'Pause'}
        </button>

        <button
          onClick={nextSlide}
          className="flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full bg-card border border-border hover:border-primary hover:bg-primary/5 text-foreground transition-all duration-300 group"
          aria-label="Next slide"
        >
          <ChevronRight className="w-5 h-5 md:w-6 md:h-6 group-hover:text-primary" />
        </button>
      </div>

      <div className="text-center mt-8 text-foreground/50 text-sm">
        <p>Utilisez les flèches ← → pour naviguer • Cliquez sur les points pour sélectionner une diapo</p>
      </div>
    </div>
  );
}
